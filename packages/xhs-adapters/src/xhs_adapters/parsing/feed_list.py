"""Cookie HTTP 推荐页与搜索页初始状态解析器。"""

from typing import Literal

from pydantic import ValidationError
from xhs_core.domain import (
    FeedListResult,
    ProviderError,
    ProviderFailureCode,
    ProviderKind,
)

from ._feed_data import (
    boolean,
    contains_feed_candidate,
    parse_feed_summaries,
    record,
    text,
    unwrap,
)
from ._initial_state import load_latest_initial_state


class FeedListStateParser:
    """把推荐或搜索页面状态转换为统一 Feed 列表。"""

    def parse(
        self,
        html: str,
        source: Literal["home", "search"],
        *,
        keyword: str | None = None,
    ) -> FeedListResult:
        """解析推荐流或默认筛选搜索结果。

        Args:
            html: 小红书页面 HTML。
            source: 推荐页使用 ``home``，搜索页使用 ``search``。
            keyword: 搜索请求的原始关键词。

        Returns:
            长度和字段均受领域模型约束的 Feed 列表。

        Raises:
            ProviderError: 页面状态缺失、关键词不一致或结果结构无效。
        """
        state = load_latest_initial_state(html)
        if state is None:
            raise _page_incompatible("HTTP 页面没有可解析的初始状态")
        state_key = "feed" if source == "home" else "search"
        container = record(state.get(state_key))
        if "feeds" not in container:
            message = (
                "HTTP 推荐流尚未加载" if source == "home" else "HTTP 搜索结果尚未加载"
            )
            raise _page_incompatible(message)
        raw_feeds = unwrap(container.get("feeds"))
        if not isinstance(raw_feeds, list):
            raise _invalid_result("HTTP Feed 列表结构无效")
        if source == "search":
            _validate_keyword(container, keyword)
        items = parse_feed_summaries(raw_feeds, limit=200)
        if contains_feed_candidate(raw_feeds) and not items:
            raise _invalid_result("HTTP Feed 列表没有有效帖子")
        try:
            return FeedListResult(
                items=items,
                source=source,
                keyword=keyword if source == "search" else None,
                has_more=boolean(container.get("hasMore", container.get("has_more"))),
                cursor=text(container.get("cursor"))[:2048],
            )
        except ValidationError:
            raise _invalid_result("HTTP Feed 列表结果结构无效") from None


def _validate_keyword(container: dict[str, object], keyword: str | None) -> None:
    if not keyword:
        raise _invalid_result("HTTP 搜索关键词无效")
    if "keyword" not in container:
        return
    actual = text(unwrap(container.get("keyword")))
    if not actual or actual != keyword:
        raise _invalid_result("HTTP 搜索结果与请求关键词不一致")


def _page_incompatible(message: str) -> ProviderError:
    return ProviderError(
        ProviderKind.HTTP,
        ProviderFailureCode.PAGE_INCOMPATIBLE,
        message,
    )


def _invalid_result(message: str) -> ProviderError:
    return ProviderError(
        ProviderKind.HTTP,
        ProviderFailureCode.INVALID_RESULT,
        message,
    )
