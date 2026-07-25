"""执行受管发布按钮的最终可信输入。"""

from xhs_core.domain import ManagedBrowserError

from .managed_page_session import ManagedPageSession
from .managed_publication_contract import (
    PREPARE_PUBLISH_EXPRESSION,
    CapturedPublishClick,
    PublicationClick,
    SelectorPublishClick,
    validate_creator_page,
    validate_publish_response,
)
from .managed_publication_page import ManagedPublicationPage

_CLICK_TIMEOUT_MILLISECONDS = 5_000


async def click_prepared_publish(
    page: ManagedPublicationPage,
    click: PublicationClick,
    session: ManagedPageSession,
) -> None:
    """在原子安全标记完成后执行唯一一次发布点击。

    封闭 Shadow DOM 会在持久化等待结束后重新聚焦真实按钮，
    再通过可信键盘输入执行一次标准按钮激活。

    Args:
        page: 当前同一受管创作页面。
        click: 原子安全标记前核验出的按钮动作类型。
        session: 提供语义节点聚焦与可信键盘输入的 CDP 会话。

    Raises:
        ManagedBrowserError: 页面离站、按钮重取失败或动作类型发生变化。
    """
    validate_creator_page(page.url)
    if isinstance(click, SelectorPublishClick):
        await page.click(
            click.selector,
            strict=True,
            timeout=_CLICK_TIMEOUT_MILLISECONDS,
        )
        return
    refreshed = validate_publish_response(
        await page.evaluate(PREPARE_PUBLISH_EXPRESSION)
    )
    validate_creator_page(page.url)
    if not isinstance(refreshed, CapturedPublishClick):
        raise ManagedBrowserError("受管发布按钮动作在提交前发生变化")
    await session.activate_focused_publish_button(page)
