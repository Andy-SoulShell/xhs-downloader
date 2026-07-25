"""Feed 初始状态解析共用的受限数据转换。"""

import math
from typing import Any

from pydantic import HttpUrl, TypeAdapter, ValidationError
from xhs_core.domain import FeedAuthor, FeedMetrics, FeedSummary

_MISSING = object()
_HTTP_URL = TypeAdapter(HttpUrl)
_MAX_SCANNED_FEEDS = 2_000


def record(value: Any) -> dict[str, Any]:
    """把未知值安全收窄为字典。

    Args:
        value: 尚未信任的页面状态值。

    Returns:
        字典原值；类型不符时返回空字典。
    """
    return value if isinstance(value, dict) else {}


def values(value: Any) -> list[Any]:
    """把未知值安全收窄为列表。

    Args:
        value: 尚未信任的页面状态值。

    Returns:
        列表原值；类型不符时返回空列表。
    """
    return value if isinstance(value, list) else []


def unwrap(value: Any) -> Any:
    """兼容初始状态的 ``value`` 与 ``_value`` 包装。

    Args:
        value: 可能带响应式包装的值。

    Returns:
        优先解出的公开值、内部值或未包装原值。
    """
    wrapped = record(value)
    if "value" in wrapped:
        return wrapped["value"]
    if "_value" in wrapped:
        return wrapped["_value"]
    return value


def text(value: Any) -> str:
    """把受支持的标量转换为文本。

    Args:
        value: 未知标量。

    Returns:
        字符串或数字的文本形式；其他类型返回空字符串。
    """
    if isinstance(value, bool) or not isinstance(value, (str, int, float)):
        return ""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value)


def integer(value: Any) -> int | None:
    """把非负有限数值转换为整数。

    Args:
        value: 未知数值。

    Returns:
        截断后的非负整数；无效值返回 ``None``。
    """
    if value is _MISSING:
        return None
    if value is None or (isinstance(value, str) and not value.strip()):
        return 0
    try:
        number = float(value)
    except (OverflowError, TypeError, ValueError):
        return None
    return math.trunc(number) if math.isfinite(number) and number >= 0 else None


def boolean(value: Any) -> bool:
    """仅接受页面提供的真正布尔值。

    Args:
        value: 未知状态值。

    Returns:
        布尔原值；其他类型返回假。
    """
    return value if isinstance(value, bool) else False


def url(value: Any) -> str | None:
    """验证页面返回的 HTTP(S) URL。

    Args:
        value: 未知地址值。

    Returns:
        Pydantic 验证后的地址；无效值返回 ``None``。
    """
    raw = text(value)
    try:
        return str(_HTTP_URL.validate_python(raw))
    except ValidationError:
        return None


def parse_feed_author(value: Any) -> FeedAuthor | None:
    """解析 Feed 卡片或评论中的作者。

    Args:
        value: 页面作者对象。

    Returns:
        具备有效用户 ID 的作者；字段不完整时返回 ``None``。
    """
    user = record(value)
    user_id = text(_coalesce(user.get("userId"), user.get("user_id")))
    if not user_id:
        return None
    try:
        return FeedAuthor(
            user_id=user_id,
            nickname=text(_coalesce(user.get("nickname"), user.get("nickName")))[:200],
            avatar_url=url(_coalesce(user.get("avatar"), user.get("image"))),
        )
    except ValidationError:
        return None


def parse_feed_metrics(value: Any) -> FeedMetrics:
    """解析平台展示的互动状态和计数。

    Args:
        value: 页面互动信息对象。

    Returns:
        长度受限且具有默认值的互动指标。
    """
    metrics = record(value)
    return FeedMetrics(
        liked=boolean(metrics.get("liked")),
        liked_count=(text(metrics.get("likedCount")) or "0")[:100],
        collected=boolean(metrics.get("collected")),
        collected_count=(text(metrics.get("collectedCount")) or "0")[:100],
        comment_count=(text(metrics.get("commentCount")) or "0")[:100],
        shared_count=(text(metrics.get("sharedCount")) or "0")[:100],
    )


def parse_feed_summaries(value: list[Any], *, limit: int) -> list[FeedSummary]:
    """解析并限制嵌套 Feed 卡片列表。

    Args:
        value: 已确认是列表的 Feed 状态。
        limit: 最多返回的有效摘要数。

    Returns:
        忽略平台非 Feed 卡片后的有效摘要。
    """
    summaries: list[FeedSummary] = []
    for candidate in _flatten_feeds(value):
        parsed = _parse_feed_summary(candidate)
        if parsed is not None:
            summaries.append(parsed)
            if len(summaries) >= limit:
                break
    return summaries


def contains_feed_candidate(value: list[Any]) -> bool:
    """判断嵌套列表是否至少包含一个非列表元素。

    Args:
        value: 已确认是列表的 Feed 状态。

    Returns:
        存在候选卡片时返回真。
    """
    return any(candidate is not None for candidate in _flatten_feeds(value))


def _parse_feed_summary(value: Any) -> FeedSummary | None:
    feed = record(value)
    note = record(feed.get("noteCard"))
    author = parse_feed_author(note.get("user"))
    feed_id = text(_coalesce(feed.get("id"), note.get("noteId")))
    if not feed_id or author is None:
        return None
    cover = record(note.get("cover"))
    capability = record(record(note.get("video")).get("capa"))
    try:
        return FeedSummary(
            feed_id=feed_id,
            xsec_token=text(_coalesce(feed.get("xsecToken"), note.get("xsecToken")))[
                :2048
            ],
            title=text(_coalesce(note.get("displayTitle"), note.get("title")))[:500],
            note_type=_note_type(note.get("type")),
            author=author,
            metrics=parse_feed_metrics(note.get("interactInfo")),
            cover_url=url(
                _coalesce(
                    cover.get("urlDefault"),
                    cover.get("urlPre"),
                    cover.get("url"),
                )
            ),
            cover_width=integer(cover.get("width", _MISSING)),
            cover_height=integer(cover.get("height", _MISSING)),
            video_duration=integer(capability.get("duration", _MISSING)),
        )
    except ValidationError:
        return None


def _flatten_feeds(value: list[Any]):
    pending = list(reversed(value))
    scanned = 0
    while pending and scanned < _MAX_SCANNED_FEEDS:
        candidate = pending.pop()
        if isinstance(candidate, list):
            pending.extend(reversed(candidate))
            continue
        scanned += 1
        yield candidate


def _coalesce(*candidates: Any) -> Any:
    return next((candidate for candidate in candidates if candidate is not None), None)


def _note_type(value: Any) -> str:
    kind = text(value).lower()
    if kind == "video":
        return "video"
    return "image" if kind in {"normal", "image"} else "unknown"
