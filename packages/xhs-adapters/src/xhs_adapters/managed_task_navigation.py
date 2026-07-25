"""构造并验证受管浏览器任务页面地址。"""

from typing import Any
from urllib.parse import quote, urlencode, urlsplit

from xhs_core.domain import BrowserTask, BrowserTaskKind, ManagedBrowserError

XHS_ORIGIN = "https://www.xiaohongshu.com"
EXPLORE_URL = f"{XHS_ORIGIN}/explore/"


def managed_task_target_url(task: BrowserTask) -> str:
    """构造浏览器任务的受信任目标页面。

    Args:
        task: 已通过领域输入模型校验的任务。

    Returns:
        只指向小红书 HTTPS 站点的页面地址。

    Raises:
        ManagedBrowserError: 任务尚未支持或缺少必要参数。
    """
    if task.kind in {
        BrowserTaskKind.CHECK_LOGIN_STATUS,
        BrowserTaskKind.GET_LOGIN_QRCODE,
        BrowserTaskKind.LIST_FEEDS,
        BrowserTaskKind.GET_MY_PROFILE,
    }:
        return EXPLORE_URL
    if task.kind is BrowserTaskKind.SEARCH_FEEDS:
        query = urlencode(
            {
                "keyword": _payload_text(task, "keyword"),
                "source": "web_explore_feed",
            }
        )
        return f"{XHS_ORIGIN}/search_result?{query}"
    if task.kind is BrowserTaskKind.GET_USER_PROFILE:
        user_id = quote(_payload_text(task, "user_id"), safe="")
        query = urlencode(
            {
                "xsec_token": _payload_text(task, "xsec_token"),
                "xsec_source": "pc_note",
            }
        )
        return f"{XHS_ORIGIN}/user/profile/{user_id}?{query}"
    if task.kind in {
        BrowserTaskKind.GET_FEED_DETAIL,
        BrowserTaskKind.SET_LIKE,
        BrowserTaskKind.SET_FAVORITE,
    }:
        feed_id = quote(_payload_text(task, "feed_id"), safe="")
        query = urlencode(
            {
                "xsec_token": _payload_text(task, "xsec_token"),
                "xsec_source": "pc_feed",
            }
        )
        return f"{XHS_ORIGIN}/explore/{feed_id}?{query}"
    raise ManagedBrowserError("当前受管浏览器版本尚未支持此任务")


def safe_xhs_navigation(value: Any) -> str:
    """验证页面适配器请求的站内导航。

    Args:
        value: 页面返回的未知导航值。

    Returns:
        保持查询参数不变的受信任小红书 HTTPS 地址。

    Raises:
        ManagedBrowserError: 地址类型、来源或凭据部分不安全。
    """
    if not isinstance(value, str):
        raise ManagedBrowserError("页面返回了无效的导航地址")
    try:
        parsed = urlsplit(value)
        trusted = (
            parsed.scheme == "https"
            and parsed.hostname == "www.xiaohongshu.com"
            and not parsed.username
            and not parsed.password
            and parsed.port in {None, 443}
        )
    except ValueError:
        trusted = False
    if not trusted:
        raise ManagedBrowserError("页面返回了不受支持的导航地址")
    return value


def is_xhs_page(value: str) -> bool:
    """判断页面地址是否属于小红书主站。

    Args:
        value: 仅在进程内判定且不写入日志的页面地址。

    Returns:
        主机名精确匹配时返回真。
    """
    try:
        parsed = urlsplit(value)
        return (
            parsed.scheme == "https"
            and parsed.hostname == "www.xiaohongshu.com"
            and parsed.port in {None, 443}
        )
    except ValueError:
        return False


def is_explore_or_login_page(value: str) -> bool:
    """判断页面是否适合继续承载二维码登录。

    Args:
        value: 仅在进程内判定且不写入日志的页面地址。

    Returns:
        小红书探索页或登录页返回真。
    """
    try:
        parsed = urlsplit(value)
    except ValueError:
        return False
    try:
        trusted_origin = (
            parsed.scheme == "https"
            and parsed.hostname == "www.xiaohongshu.com"
            and parsed.port in {None, 443}
        )
    except ValueError:
        return False
    return trusted_origin and (
        parsed.path.startswith("/explore") or "login" in parsed.path
    )


def _payload_text(task: BrowserTask, field: str) -> str:
    value = task.payload.get(field)
    if not isinstance(value, str) or not value:
        raise ManagedBrowserError(f"浏览器任务缺少参数 {field}")
    return value
