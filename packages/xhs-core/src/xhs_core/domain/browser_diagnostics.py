"""浏览器页面失败诊断的服务端白名单规则。"""

from typing import Any

from pydantic import JsonValue

from .browser_tasks import BrowserTask, BrowserTaskStatus

_MAX_ADAPTER_VERSION_LENGTH = 32
_MAX_ANCHOR_COUNT = 8
_MAX_INSPECTED_ANCHORS = 16
_KNOWN_ADAPTER_VERSIONS = frozenset({"xhs-web-2026.07"})
_KNOWN_SELECTOR_PROFILES = frozenset(
    {
        "initial-state-v1",
        "semantic-dom-v1",
        "unknown",
    }
)
_KNOWN_PAGE_KINDS = frozenset(
    {
        "home",
        "search",
        "feed_detail",
        "profile",
        "unknown",
    }
)
_KNOWN_ANCHORS = frozenset(
    {
        "initial_state",
        "main_container",
        "feed_container",
        "filter_control",
        "comment_container",
        "detail_container",
        "profile_container",
    }
)
_SAFE_TERMINAL_MESSAGES = {
    BrowserTaskStatus.FAILED: "浏览器任务执行失败，可安全重试",
    BrowserTaskStatus.NEEDS_REVIEW: "浏览器操作结果无法确认，请人工核对平台状态",
}


def sanitize_browser_page_diagnostics(
    value: dict[str, Any] | None,
) -> dict[str, JsonValue] | None:
    """把不可信失败结果裁剪为有界页面兼容性诊断。

    只保留与当前内置页面适配器匹配的版本、选择器配置、页面类型及
    已知锚点。URL、令牌、页面原文、用户文本和其他扩展字段不会进入
    返回值。数组读取与输出数量均受限，避免恶意超长结果扩张存储。

    Args:
        value: 扩展或受管浏览器返回的未知失败结果。

    Returns:
        通过白名单的有界诊断；没有安全字段时返回 ``None``。
    """
    if not isinstance(value, dict):
        return None
    diagnostics: dict[str, JsonValue] = {}
    adapter_version = _known_text(
        value.get("adapter_version"),
        _KNOWN_ADAPTER_VERSIONS,
        _MAX_ADAPTER_VERSION_LENGTH,
    )
    if adapter_version is not None:
        diagnostics["adapter_version"] = adapter_version
    selector_profile = _known_text(
        value.get("selector_profile"),
        _KNOWN_SELECTOR_PROFILES,
    )
    if selector_profile is not None:
        diagnostics["selector_profile"] = selector_profile
    page_kind = _known_text(value.get("page_kind"), _KNOWN_PAGE_KINDS)
    if page_kind is not None:
        diagnostics["page_kind"] = page_kind
    for field in ("matched_anchors", "missing_anchors"):
        anchors = _known_anchors(value.get(field))
        if anchors is not None:
            diagnostics[field] = anchors
    return diagnostics or None


def sanitize_browser_task_message(
    status: BrowserTaskStatus,
    value: str,
) -> str:
    """清洗浏览器执行器提供的状态消息。

    失败和待人工核对消息可能来自页面异常原文，因此一律替换为服务端
    固定摘要；其他状态仍保留现有的千字符边界。

    Args:
        status: 任务即将进入的状态。
        value: 尚未信任的执行器消息。

    Returns:
        不包含页面输入的受控消息。
    """
    return _SAFE_TERMINAL_MESSAGES.get(status, value[:1000])


def sanitize_stored_browser_task(task: BrowserTask) -> BrowserTask:
    """清洗从旧持久化记录加载的非成功终态。

    Args:
        task: 仓储解析出的旧任务快照。

    Returns:
        失败数据已经白名单化的任务；其他状态原样返回。
    """
    if task.status not in _SAFE_TERMINAL_MESSAGES:
        return task
    safe_result = sanitize_browser_page_diagnostics(task.result)
    safe_message = sanitize_browser_task_message(task.status, task.message)
    if task.result == safe_result and task.message == safe_message:
        return task
    return task.model_copy(
        update={
            "result": safe_result,
            "message": safe_message,
        }
    )


def _known_text(
    value: Any,
    allowed: frozenset[str],
    max_length: int | None = None,
) -> str | None:
    if not isinstance(value, str):
        return None
    if max_length is not None and len(value) > max_length:
        return None
    return value if value in allowed else None


def _known_anchors(value: Any) -> list[str] | None:
    if not isinstance(value, list):
        return None
    anchors: list[str] = []
    for item in value[:_MAX_INSPECTED_ANCHORS]:
        if isinstance(item, str) and item in _KNOWN_ANCHORS and item not in anchors:
            anchors.append(item)
            if len(anchors) == _MAX_ANCHOR_COUNT:
                break
    return anchors
