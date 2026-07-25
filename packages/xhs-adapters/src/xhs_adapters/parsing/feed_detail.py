"""Cookie HTTP 详情页初始状态解析器。"""

import math
from typing import Any

from pydantic import HttpUrl, TypeAdapter, ValidationError
from xhs_core.domain import (
    FeedAuthor,
    FeedComment,
    FeedDetailResult,
    FeedMetrics,
    ProviderError,
    ProviderFailureCode,
    ProviderKind,
)

from ._initial_state import load_latest_initial_state

_MISSING = object()
_HTTP_URL = TypeAdapter(HttpUrl)


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
        note = _record(wrapper.get("note"))
        try:
            author = _parse_author(note.get("user"))
            if author is None or _text(note.get("noteId")) != feed_id:
                raise _invalid_result("HTTP 详情页返回的帖子数据不完整或不一致")
            comments = _record(_unwrap(wrapper.get("comments")))
            return FeedDetailResult(
                feed_id=feed_id,
                xsec_token=_text(note.get("xsecToken")) or xsec_token,
                title=_text(note.get("title"))[:500],
                body=_text(note.get("desc"))[:20_000],
                note_type=_note_type(note.get("type")),
                author=author,
                metrics=_parse_metrics(note.get("interactInfo")),
                image_urls=_parse_image_urls(note.get("imageList")),
                published_at=_integer(note.get("time", _MISSING)),
                ip_location=_text(note.get("ipLocation"))[:200],
                comments=_parse_comments(
                    _unwrap(comments.get("list")),
                    comment_limit,
                    include_replies,
                    reply_limit,
                ),
                comments_has_more=_boolean(comments.get("hasMore")),
                comments_cursor=_text(comments.get("cursor"))[:2048],
            )
        except ValidationError:
            raise _invalid_result("HTTP 详情页结果结构无效") from None


def _select_wrapper(state: dict[str, Any], feed_id: str) -> dict[str, Any]:
    note_state = _record(state.get("note"))
    detail_map = _record(note_state.get("noteDetailMap"))
    if not detail_map:
        raise _page_incompatible("HTTP 页面尚未提供详情状态")
    direct = _record(detail_map.get(feed_id))
    if direct:
        return direct
    for value in detail_map.values():
        wrapper = _record(value)
        if _text(_record(wrapper.get("note")).get("noteId")) == feed_id:
            return wrapper
    raise _invalid_result("HTTP 详情页没有返回请求的帖子")


def _parse_comments(
    value: Any,
    limit: int,
    include_replies: bool,
    reply_limit: int,
) -> list[FeedComment]:
    comments: list[FeedComment] = []
    for item in _list(value)[:limit]:
        parsed = _parse_comment(item, include_replies, reply_limit)
        if parsed is not None:
            comments.append(parsed)
    return comments


def _parse_comment(
    value: Any,
    include_replies: bool,
    reply_limit: int,
) -> FeedComment | None:
    comment = _record(value)
    author = _parse_author(comment.get("userInfo"))
    comment_id = _text(comment.get("id"))
    if not comment_id or author is None:
        return None
    replies = (
        [
            parsed
            for item in _list(_unwrap(comment.get("subComments")))[:reply_limit]
            if (parsed := _parse_comment(item, False, 0)) is not None
        ]
        if include_replies
        else []
    )
    return FeedComment(
        comment_id=comment_id,
        content=_text(comment.get("content"))[:5000],
        author=author,
        liked=_boolean(comment.get("liked")),
        like_count=_text(comment.get("likeCount")) or "0",
        created_at=_integer(comment.get("createTime", _MISSING)),
        ip_location=_text(comment.get("ipLocation"))[:200],
        reply_count=_text(comment.get("subCommentCount")) or str(len(replies)),
        replies=replies,
    )


def _parse_author(value: Any) -> FeedAuthor | None:
    user = _record(value)
    user_id = _text(_coalesce(user.get("userId"), user.get("user_id")))
    if not user_id:
        return None
    avatar = _url(_coalesce(user.get("avatar"), user.get("image")))
    return FeedAuthor(
        user_id=user_id,
        nickname=_text(_coalesce(user.get("nickname"), user.get("nickName")))[:200],
        avatar_url=avatar,
    )


def _parse_metrics(value: Any) -> FeedMetrics:
    metrics = _record(value)
    return FeedMetrics(
        liked=_boolean(metrics.get("liked")),
        liked_count=_text(metrics.get("likedCount")) or "0",
        collected=_boolean(metrics.get("collected")),
        collected_count=_text(metrics.get("collectedCount")) or "0",
        comment_count=_text(metrics.get("commentCount")) or "0",
        shared_count=_text(metrics.get("sharedCount")) or "0",
    )


def _parse_image_urls(value: Any) -> list[str]:
    urls: list[str] = []
    for item in _list(value):
        image = _record(item)
        url = _url(
            _coalesce(
                image.get("urlDefault"),
                image.get("urlPre"),
                image.get("url"),
            )
        )
        if url is not None:
            urls.append(url)
    return urls[:100]


def _record(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _unwrap(value: Any) -> Any:
    wrapped = _record(value)
    if "value" in wrapped:
        return wrapped["value"]
    if "_value" in wrapped:
        return wrapped["_value"]
    return value


def _coalesce(*values: Any) -> Any:
    return next((value for value in values if value is not None), None)


def _text(value: Any) -> str:
    if isinstance(value, bool) or not isinstance(value, (str, int, float)):
        return ""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value)


def _integer(value: Any) -> int | None:
    if value is _MISSING:
        return None
    if value is None or (isinstance(value, str) and not value.strip()):
        return 0
    try:
        number = float(value)
    except (OverflowError, TypeError, ValueError):
        return None
    return math.trunc(number) if math.isfinite(number) and number >= 0 else None


def _boolean(value: Any) -> bool:
    return value if isinstance(value, bool) else False


def _url(value: Any) -> str | None:
    raw = _text(value)
    try:
        return str(_HTTP_URL.validate_python(raw))
    except ValidationError:
        return None


def _note_type(value: Any) -> str:
    kind = _text(value).lower()
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
