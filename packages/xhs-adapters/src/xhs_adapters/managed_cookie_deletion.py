"""在受管浏览器上下文中安全清理小红书 Cookie。"""

from xhs_core.domain import (
    BrowserCookieDeletionResult,
    BrowserTaskExecutionResult,
    BrowserTaskStatus,
)

from .managed_page_session import ManagedPageSession
from .managed_task_navigation import is_xhs_site_page
from .managed_task_results import managed_task_failure


async def delete_managed_xhs_cookies(
    session: ManagedPageSession,
) -> BrowserTaskExecutionResult:
    """清理精确域 Cookie 并关闭当前上下文中的小红书页面。

    该操作不读取 Cookie 列表或 Cookie 值。清理或页面关闭失败均属于未
    写入外部平台的明确失败，可以由用户显式重试。

    Args:
        session: 已连接受管 Chromium 默认上下文的短期会话。

    Returns:
        正式 Cookie 清理结果，或不包含异常原文的明确失败。
    """
    try:
        await session.delete_xhs_cookies()
    except Exception:
        return managed_task_failure(
            "受管浏览器 Cookie 清理失败，未产生平台写入，可安全重试"
        )

    try:
        pages = await session.pages()
    except Exception:
        return managed_task_failure(
            "小红书 Cookie 已清理，但相关页面状态读取失败，可安全重试"
        )

    close_failed = False
    for page in pages:
        try:
            if is_xhs_site_page(page.url):
                await page.close()
        except Exception:
            close_failed = True
    if close_failed:
        return managed_task_failure(
            "小红书 Cookie 已清理，但相关页面未能全部关闭，可安全重试"
        )

    result = BrowserCookieDeletionResult(target="browser", deleted=True)
    return BrowserTaskExecutionResult(
        status=BrowserTaskStatus.SUCCEEDED,
        message="受管浏览器中的小红书 Cookie 已清除",
        result=result.model_dump(mode="json"),
    )
