"""Cookie HTTP 详情页初始状态解析器。"""

from typing import Any

from pydantic import ValidationError
from xhs_core.domain import (
    FeedComment,
    FeedDetailResult,
    ProviderError,
    ProviderFailureCode,
    ProviderKind,
)

from ._feed_data import (
    boolean,
    integer,
    parse_feed_author,
    parse_feed_metrics,
    record,
    text,
    unwrap,
    url,
    values,
)
from ._initial_state import load_latest_initial_state


class FeedDetailStateParser:
    """把详情页原始初始状态忠实转换为统一 Feed 详情模型。"""

    def parse(
        self,
        html: str,
        feed_id: str,
        xsec_token: str,
        *,
        comment_limit: int,
        include_replies: bool,
        reply_limit: int,
    ) -> FeedDetailResult:
        """解析目标帖子及页面当前已加载的评论。

        Args:
            html: 小红书详情页 HTML。
            feed_id: 必须与页面作品严格一致的帖子 ID。
            xsec_token: 请求携带的帖子访问令牌，仅在页面未返回时使用。
            comment_limit: 最多返回的一级评论数。
            include_replies: 是否返回页面当前已加载的回复。
            reply_limit: 每条一级评论最多返回的回复数。

        Returns:
            与浏览器扩展解析语义一致的详情结果。

        Raises:
            ProviderError: 页面状态不兼容、目标 ID 不符或结果结构无效。
        """
        state = load_latest_initial_state(html)
        if state is None:
            raise _page_incompatible("HTTP 详情页没有可解析的初始状态")
        wrapper = _select_wrapper(state, feed_id)
        note = record(wrapper.get("note"))
        try:
            author = parse_feed_author(note.get("user"))
            if author is None or text(note.get("noteId")) != feed_id:
                raise _invalid_result("HTTP 详情页返回的帖子数据不完整或不一致")
            comments = record(unwrap(wrapper.get("comments")))
            return FeedDetailResult(
                feed_id=feed_id,
                xsec_token=text(note.get("xsecToken")) or xsec_token,
                title=text(note.get("title"))[:500],
                body=text(note.get("desc"))[:20_000],
                note_type=_note_type(note.get("type")),
                author=author,
                metrics=parse_feed_metrics(note.get("interactInfo")),
                image_urls=_parse_image_urls(note.get("imageList")),
                published_at=integer(note.get("time")) if "time" in note else None,
                ip_location=text(note.get("ipLocation"))[:200],
                comments=_parse_comments(
                    unwrap(comments.get("list")),
                    comment_limit,
                    include_replies,
                    reply_limit,
                ),
                comments_has_more=boolean(comments.get("hasMore")),
                comments_cursor=text(comments.get("cursor"))[:2048],
            )
        except ValidationError:
            raise _invalid_result("HTTP 详情页结果结构无效") from None


def _select_wrapper(state: dict[str, Any], feed_id: str) -> dict[str, Any]:
    note_state = record(state.get("note"))
    detail_map = record(note_state.get("noteDetailMap"))
    if not detail_map:
        raise _page_incompatible("HTTP 页面尚未提供详情状态")
    direct = record(detail_map.get(feed_id))
    if direct:
        return direct
    for value in detail_map.values():
        wrapper = record(value)
        if text(record(wrapper.get("note")).get("noteId")) == feed_id:
            return wrapper
    raise _invalid_result("HTTP 详情页没有返回请求的帖子")


def _parse_comments(
    value: Any,
    limit: int,
    include_replies: bool,
    reply_limit: int,
) -> list[FeedComment]:
    comments: list[FeedComment] = []
    for item in values(value)[:limit]:
        parsed = _parse_comment(item, include_replies, reply_limit)
        if parsed is not None:
            comments.append(parsed)
    return comments


def _parse_comment(
    value: Any,
    include_replies: bool,
    reply_limit: int,
) -> FeedComment | None:
    comment = record(value)
    author = parse_feed_author(comment.get("userInfo"))
    comment_id = text(comment.get("id"))
    if not comment_id or author is None:
        return None
    replies = (
        [
            parsed
            for item in values(unwrap(comment.get("subComments")))[:reply_limit]
            if (parsed := _parse_comment(item, False, 0)) is not None
        ]
        if include_replies
        else []
    )
    return FeedComment(
        comment_id=comment_id,
        content=text(comment.get("content"))[:5000],
        author=author,
        liked=boolean(comment.get("liked")),
        like_count=text(comment.get("likeCount")) or "0",
        created_at=(
            integer(comment.get("createTime")) if "createTime" in comment else None
        ),
        ip_location=text(comment.get("ipLocation"))[:200],
        reply_count=text(comment.get("subCommentCount")) or str(len(replies)),
        replies=replies,
    )


def _parse_image_urls(value: Any) -> list[str]:
    urls: list[str] = []
    for item in values(value):
        image = record(item)
        parsed_url = url(
            _coalesce(
                image.get("urlDefault"),
                image.get("urlPre"),
                image.get("url"),
            )
        )
        if parsed_url is not None:
            urls.append(parsed_url)
    return urls[:100]


def _coalesce(*values: Any) -> Any:
    return next((value for value in values if value is not None), None)


def _note_type(value: Any) -> str:
    kind = text(value).lower()
    if kind == "video":
        return "video"
    return "image" if kind in {"normal", "image"} else "unknown"


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
