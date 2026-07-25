"""页面内嵌初始状态的安全读取工具。"""

import json
from typing import Any

from lxml.etree import HTML, LxmlError

_PREFIX = "window.__INITIAL_STATE__"


def load_latest_initial_state(html: str) -> dict[str, Any] | None:
    """读取最后一份可解析的页面初始状态。

    Args:
        html: 待解析的页面 HTML。

    Returns:
        初始状态对象；页面没有有效状态时返回 ``None``。
    """
    if not html:
        return None
    try:
        tree = HTML(html)
    except (LxmlError, TypeError, ValueError):
        return None
    if tree is None:
        return None
    scripts = [
        str(value).strip()
        for value in tree.xpath("//script/text()")
        if str(value).strip().startswith(_PREFIX)
    ]
    for script in reversed(scripts):
        try:
            separator = script.index("=")
            raw = script[separator + 1 :].strip().removesuffix(";")
            state = json.loads(
                _normalize_javascript_value(raw),
                parse_constant=_reject_json_constant,
            )
            return state if isinstance(state, dict) else {}
        except (ValueError, TypeError, json.JSONDecodeError):
            continue
    return None


def initial_state_is_guest(html: str) -> bool:
    """判断页面状态是否明确标记当前会话为访客。

    Args:
        html: 小红书页面 HTML。

    Returns:
        只有状态中的 ``guest`` 为真正布尔值 ``True`` 时返回真。
    """
    state = load_latest_initial_state(html) or {}
    user = state.get("user")
    if not isinstance(user, dict):
        return False
    raw_info = user.get("userInfo")
    if not isinstance(raw_info, dict):
        return False
    info = raw_info.get("value", raw_info.get("_value", raw_info))
    return isinstance(info, dict) and info.get("guest") is True


def _normalize_javascript_value(value: str) -> str:
    result: list[str] = []
    quote = ""
    escaped = False
    index = 0
    while index < len(value):
        character = value[index]
        if quote:
            result.append(character)
            if escaped:
                escaped = False
            elif character == "\\":
                escaped = True
            elif character == quote:
                quote = ""
            index += 1
            continue
        if character in {'"', "'"}:
            quote = character
            result.append(character)
            index += 1
            continue
        if value[index : index + 9] == "undefined" and _token_boundaries(value, index):
            result.append("null")
            index += 9
            continue
        result.append(character)
        index += 1
    return "".join(result)


def _token_boundaries(value: str, index: int) -> bool:
    before = value[index - 1] if index else ""
    after = value[index + 9] if index + 9 < len(value) else ""
    return not _identifier_character(before) and not _identifier_character(after)


def _identifier_character(value: str) -> bool:
    return bool(value) and (value.isalnum() or value in {"_", "$"})


def _reject_json_constant(value: str) -> Any:
    raise ValueError(value)
