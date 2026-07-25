"""通过本机 CDP 建立短生命周期的 Playwright 页面会话。"""

from collections.abc import Callable, Sequence
from typing import Any, Protocol

from playwright.async_api import (
    Browser,
    BrowserContext,
    Page,
    Playwright,
    async_playwright,
)
from playwright.async_api import (
    Error as PlaywrightError,
)
from xhs_core.domain import ManagedBrowserError

from .chromium_process import CDP_HOST

CDP_CONNECT_TIMEOUT_MILLISECONDS = 10_000


class ManagedPage(Protocol):
    """受管任务执行器依赖的最小页面接口。"""

    @property
    def url(self) -> str:
        """返回当前页面地址。

        Returns:
            仅用于进程内导航判定且不应写入日志的地址。
        """
        ...

    async def goto(
        self,
        url: str,
        **options: Any,
    ) -> Any:
        """导航到受信任地址。

        Args:
            url: 已验证的小红书页面地址。
            **options: Playwright 页面就绪阶段和等待上限。

        Returns:
            Playwright 导航响应；调用方不读取其中的敏感信息。
        """
        ...

    async def evaluate(self, expression: str, arg: Any = None) -> Any:
        """在页面主世界执行适配器调用。

        Args:
            expression: 固定的适配器调用表达式。
            arg: 已验证的结构化任务。

        Returns:
            可序列化的页面执行结果。
        """
        ...

    async def close(self) -> None:
        """关闭当前任务新建的页面。"""
        ...

    async def bring_to_front(self) -> None:
        """把需要用户扫码或处理验证的页面置于前台。"""
        ...


class ManagedPageSession(Protocol):
    """受管任务执行器依赖的 CDP 会话接口。"""

    async def connect(self, port: int) -> None:
        """连接固定回环地址上的 Chromium。

        Args:
            port: Chromium 自行分配的 CDP 端口。
        """
        ...

    async def pages(self) -> Sequence[ManagedPage]:
        """列出专用浏览器默认上下文中的页面。

        Returns:
            当前仍然打开的页面。
        """
        ...

    async def new_page(self) -> ManagedPage:
        """创建任务页面。

        Returns:
            默认持久化上下文中的新页面。
        """
        ...

    async def close(self) -> None:
        """断开自动化连接，但不终止受管 Chromium。"""
        ...


class PlaywrightCdpSession:
    """连接现有 Chromium 默认上下文的 Playwright 会话。"""

    def __init__(self) -> None:
        """初始化尚未连接的会话。"""
        self._playwright: Playwright | None = None
        self._browser: Browser | None = None
        self._context: BrowserContext | None = None

    async def connect(self, port: int) -> None:
        """连接固定回环 CDP 并取得持久化默认上下文。

        Args:
            port: Chromium 自行分配的 CDP 端口。

        Raises:
            ManagedBrowserError: CDP 不可连接或缺少默认上下文。
        """
        if self._context:
            return
        self._playwright = await async_playwright().start()
        try:
            self._browser = await self._playwright.chromium.connect_over_cdp(
                f"http://{CDP_HOST}:{port}",
                timeout=CDP_CONNECT_TIMEOUT_MILLISECONDS,
                is_local=True,
            )
        except PlaywrightError as error:
            await self.close()
            raise ManagedBrowserError("无法连接受管浏览器自动化端点") from error
        if not self._browser.contexts:
            await self.close()
            raise ManagedBrowserError("受管浏览器没有可用的持久化页面上下文")
        self._context = self._browser.contexts[0]

    async def pages(self) -> Sequence[Page]:
        """列出默认上下文中的现有页面。

        Returns:
            当前页面快照。

        Raises:
            ManagedBrowserError: 会话尚未连接。
        """
        if not self._context:
            raise ManagedBrowserError("受管浏览器自动化会话尚未连接")
        return tuple(self._context.pages)

    async def new_page(self) -> Page:
        """在默认持久化上下文中创建页面。

        Returns:
            新页面。

        Raises:
            ManagedBrowserError: 会话尚未连接。
        """
        if not self._context:
            raise ManagedBrowserError("受管浏览器自动化会话尚未连接")
        return await self._context.new_page()

    async def close(self) -> None:
        """停止 Playwright 驱动并仅断开 CDP 连接。"""
        playwright = self._playwright
        self._context = None
        self._browser = None
        self._playwright = None
        if playwright:
            # Chromium 生命周期由 ChromiumController 持有; 不能发送 Browser.close。
            await playwright.stop()


ManagedPageSessionFactory = Callable[[], ManagedPageSession]
