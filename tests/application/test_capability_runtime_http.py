"""统一读取运行时的 HTTP Provider 接线测试。"""

from typing import cast

from xhs_adapters import HttpReadProvider
from xhs_adapters.config import AppSettings
from xhs_api.capability_runtime import ReadCapabilityRuntime
from xhs_core.application import BrowserReadProvider
from xhs_core.domain import (
    FeedAuthor,
    FeedDetailResult,
    FeedListResult,
    ProviderError,
    ProviderFailureCode,
    ProviderKind,
    RouteStrategy,
    UserProfileResult,
)
from xhs_core.domain.browser_requests import SearchFilters


class _Http:
    def __init__(self, *, reject_search: bool = False) -> None:
        self.calls: list[tuple[str, object]] = []
        self.closed = False
        self.reject_search = reject_search

    async def close(self) -> None:
        self.closed = True

    async def list_feeds(self):
        self.calls.append(("list", None))
        return FeedListResult(source="home")

    async def search_feeds(self, keyword, filters):
        self.calls.append(("search", (keyword, filters)))
        if self.reject_search:
            raise ProviderError(
                ProviderKind.HTTP,
                ProviderFailureCode.UNSUPPORTED,
                "HTTP 合成搜索不支持该筛选",
            )
        return FeedListResult(source="search", keyword=keyword)

    async def get_feed_detail(self, feed_id, xsec_token, **options):
        self.calls.append(("detail", (feed_id, xsec_token, options)))
        return FeedDetailResult(
            feed_id=feed_id,
            xsec_token=xsec_token,
            author=FeedAuthor(user_id="synthetic-author"),
        )

    async def get_user_profile(self, user_id, xsec_token):
        self.calls.append(("profile", (user_id, xsec_token)))
        return UserProfileResult(user_id=user_id)

    async def get_my_profile(self):
        self.calls.append(("mine", None))
        return UserProfileResult(user_id="synthetic-current")


class _Browser:
    def __init__(self) -> None:
        self.search_calls: list[tuple[str, SearchFilters, str | None]] = []

    async def search_feeds(self, keyword, filters, request_id=None):
        self.search_calls.append((keyword, filters, request_id))
        return FeedListResult(source="search", keyword=keyword)


async def test_http_only_routes_all_reads_to_http_provider() -> None:
    """确保新增推荐、搜索和主页与既有详情共用 HTTP Provider。"""
    http = _Http()
    runtime = ReadCapabilityRuntime(
        AppSettings(route_strategy=RouteStrategy.HTTP_ONLY),
        cast(HttpReadProvider, http),
        cast(BrowserReadProvider, _Browser()),
    )
    filters = SearchFilters()

    listed = await runtime.list_feeds()
    searched = await runtime.search_feeds("合成关键词", filters)
    detailed = await runtime.get_feed_detail(
        "synthetic-feed",
        "synthetic-token",
        comment_limit=3,
        include_replies=True,
        reply_limit=2,
    )
    profiled = await runtime.get_user_profile(
        "synthetic-user",
        "synthetic-profile-token",
    )
    mine = await runtime.get_my_profile()
    await runtime.close()

    assert all(
        routed.provider is ProviderKind.HTTP
        for routed in [listed, searched, detailed, profiled, mine]
    )
    assert [name for name, _ in http.calls] == [
        "list",
        "search",
        "detail",
        "profile",
        "mine",
    ]
    assert http.calls[1][1] == ("合成关键词", filters)
    assert http.closed is True


async def test_unsupported_http_filter_falls_back_to_fixed_browser() -> None:
    """确保 HTTP 明确不支持筛选时仍由统一路由安全回退浏览器。"""
    http = _Http(reject_search=True)
    browser = _Browser()
    runtime = ReadCapabilityRuntime(
        AppSettings(route_strategy=RouteStrategy.HTTP_FIRST),
        cast(HttpReadProvider, http),
        cast(BrowserReadProvider, browser),
    )
    filters = SearchFilters(sort_by="最新")

    routed = await runtime.search_feeds(
        "合成关键词",
        filters,
        request_id="synthetic-request",
    )

    assert routed.provider is ProviderKind.BROWSER
    assert routed.fallback_used is True
    assert routed.fallback_reason is not None
    assert routed.fallback_reason.code is ProviderFailureCode.UNSUPPORTED
    assert browser.search_calls == [("合成关键词", filters, "synthetic-request")]
