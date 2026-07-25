"""在受管 Chromium 页面中执行登录、读取和首批互动任务。"""

from typing import Any

from xhs_core.domain import (
    BrowserDriver,
    BrowserTask,
    BrowserTaskExecutionResult,
    BrowserTaskKind,
    BrowserTaskStatus,
    ManagedBrowserError,
    ManagedBrowserState,
)
from xhs_core.domain.browser_ports import ManagedBrowserController

from .managed_page_assets import load_managed_page_adapter
from .managed_page_session import (
    ManagedPage,
    ManagedPageSession,
    ManagedPageSessionFactory,
    PlaywrightCdpSession,
)
from .managed_task_interactions import (
    PREPARE_INTERACTION_EXPRESSION,
    complete_managed_interaction,
)
from .managed_task_navigation import (
    is_explore_or_login_page,
    is_xhs_page,
    managed_task_target_url,
    safe_xhs_navigation,
)

_ADAPTER_GLOBAL = "__XHS_DOWNLOADER_MANAGED_PAGE_ADAPTER__"
_EXECUTE_EXPRESSION = f"(task) => window.{_ADAPTER_GLOBAL}.execute(task)"
_DIAGNOSTICS_EXPRESSION = f"() => window.{_ADAPTER_GLOBAL}.diagnostics()"
_PAGE_NAVIGATION_TIMEOUT_MILLISECONDS = 30_000
_PAGE_READY_ATTEMPTS = 20
_PAGE_READY_INTERVAL_MILLISECONDS = 250
_MAX_INTERNAL_NAVIGATIONS = 2
_READ_TASKS = {
    BrowserTaskKind.CHECK_LOGIN_STATUS,
    BrowserTaskKind.GET_LOGIN_QRCODE,
    BrowserTaskKind.LIST_FEEDS,
    BrowserTaskKind.SEARCH_FEEDS,
    BrowserTaskKind.GET_FEED_DETAIL,
    BrowserTaskKind.GET_USER_PROFILE,
    BrowserTaskKind.GET_MY_PROFILE,
}
_WRITE_TASKS = {BrowserTaskKind.SET_LIKE, BrowserTaskKind.SET_FAVORITE}
_SUPPORTED_TASKS = _READ_TASKS | _WRITE_TASKS


class PlaywrightManagedTaskExecutor:
    """通过共享页面适配器执行受管浏览器读取与首批互动能力。

    Args:
        controller: 提供当前 CDP 端点的受管 Chromium 控制器。
        session_factory: 创建短生命周期 CDP 会话的可替换工厂。
    """

    def __init__(
        self,
        controller: ManagedBrowserController,
        session_factory: ManagedPageSessionFactory = PlaywrightCdpSession,
    ) -> None:
        self._controller = controller
        self._session_factory = session_factory
        self._closed = False

    async def execute(self, task: BrowserTask) -> BrowserTaskExecutionResult:
        """执行一个固定为受管驱动且已进入运行态的任务。

        Args:
            task: 已验证且进入运行态的浏览器任务。

        Returns:
            明确成功或失败的结构化终态。

        Raises:
            ManagedBrowserError: 浏览器未运行、CDP 不可用或执行器已关闭。
        """
        if self._closed:
            raise ManagedBrowserError("受管浏览器页面执行器已经关闭")
        if task.target_driver is not BrowserDriver.MANAGED:
            return _failure("任务没有固定到受管浏览器驱动")
        if task.status is not BrowserTaskStatus.RUNNING:
            return _failure("受管浏览器任务必须先进入运行态")
        if task.kind not in _SUPPORTED_TASKS:
            return _failure("当前受管浏览器版本尚未支持此任务")
        status = await self._controller.status()
        if status.state is not ManagedBrowserState.RUNNING or status.cdp_port is None:
            raise ManagedBrowserError("受管浏览器尚未运行")
        session = self._session_factory()
        try:
            await session.connect(status.cdp_port)
            page, created = await self._prepare_page(session, task)
            keep_open = False
            try:
                if task.kind in _WRITE_TASKS:
                    outcome = await self._execute_interaction(page, task)
                else:
                    response = await self._execute_with_navigation(page, task)
                    outcome = _parse_response(response)
                keep_open = _keep_login_page(task, outcome)
                if keep_open:
                    await page.bring_to_front()
                return outcome
            except Exception:
                diagnostics = await self._safe_diagnostics(page)
                return _failure("受管浏览器页面执行失败", diagnostics)
            finally:
                if created and not keep_open:
                    await page.close()
        finally:
            await session.close()

    async def close(self) -> None:
        """禁止后续任务；短生命周期 CDP 会话会在每项任务后断开。"""
        self._closed = True

    async def _prepare_page(
        self,
        session: ManagedPageSession,
        task: BrowserTask,
    ) -> tuple[ManagedPage, bool]:
        target = managed_task_target_url(task)
        if task.kind is BrowserTaskKind.CHECK_LOGIN_STATUS:
            existing = next(
                (page for page in await session.pages() if is_xhs_page(page.url)),
                None,
            )
            if existing:
                return existing, False
        if task.kind is BrowserTaskKind.GET_LOGIN_QRCODE:
            existing = next(
                (
                    page
                    for page in await session.pages()
                    if is_explore_or_login_page(page.url)
                ),
                None,
            )
            if existing:
                await existing.bring_to_front()
                return existing, False
        page = await session.new_page()
        try:
            await _navigate(page, target)
        except Exception:
            await page.close()
            raise
        return page, True

    async def _execute_with_navigation(
        self,
        page: ManagedPage,
        task: BrowserTask,
    ) -> dict[str, Any]:
        for navigation_count in range(_MAX_INTERNAL_NAVIGATIONS + 1):
            await page.evaluate(load_managed_page_adapter())
            response = await self._execute_when_ready(page, task)
            navigate_url = response.get("navigateUrl")
            if not navigate_url:
                return response
            if navigation_count == _MAX_INTERNAL_NAVIGATIONS:
                return {
                    "ok": False,
                    "message": "小红书站内页面重复要求导航",
                    "status": "failed",
                }
            await _navigate(page, safe_xhs_navigation(navigate_url))
        return {"ok": False, "message": "页面导航状态无效", "status": "failed"}

    async def _execute_interaction(
        self,
        page: ManagedPage,
        task: BrowserTask,
    ) -> BrowserTaskExecutionResult:
        await page.evaluate(load_managed_page_adapter())
        preparation = await self._execute_when_ready(
            page,
            task,
            PREPARE_INTERACTION_EXPRESSION,
        )
        return await complete_managed_interaction(page, task, preparation)

    async def _execute_when_ready(
        self,
        page: ManagedPage,
        task: BrowserTask,
        expression: str = _EXECUTE_EXPRESSION,
    ) -> dict[str, Any]:
        latest: dict[str, Any] = {}
        for attempt in range(_PAGE_READY_ATTEMPTS):
            value = await page.evaluate(
                expression,
                task.model_dump(mode="json"),
            )
            if not isinstance(value, dict):
                return {
                    "ok": False,
                    "message": "页面适配器返回了无效结果",
                    "status": "failed",
                }
            latest = value
            if (
                value.get("ok") is True
                or value.get("navigateUrl")
                or value.get("action")
            ):
                return value
            if not _is_transient_message(value.get("message")):
                return value
            if attempt + 1 < _PAGE_READY_ATTEMPTS:
                await page.evaluate(
                    f"() => new Promise((resolve) => setTimeout(resolve, "
                    f"{_PAGE_READY_INTERVAL_MILLISECONDS}))"
                )
        return latest

    async def _safe_diagnostics(
        self,
        page: ManagedPage,
    ) -> dict[str, Any] | None:
        try:
            await page.evaluate(load_managed_page_adapter())
            value = await page.evaluate(_DIAGNOSTICS_EXPRESSION)
        except Exception:
            return None
        return value if isinstance(value, dict) else None


async def _navigate(page: ManagedPage, url: str) -> None:
    await page.goto(
        url,
        wait_until="domcontentloaded",
        timeout=_PAGE_NAVIGATION_TIMEOUT_MILLISECONDS,
    )


def _is_transient_message(value: Any) -> bool:
    if not isinstance(value, str):
        return False
    return any(
        marker in value
        for marker in (
            "尚未加载",
            "没有可解析",
            "没有已登录账号的主页入口",
            "实时状态不可用",
            "实时状态超时",
        )
    )


def _parse_response(value: dict[str, Any]) -> BrowserTaskExecutionResult:
    message = value.get("message")
    safe_message = (
        message[:1000]
        if isinstance(message, str) and message
        else "受管浏览器任务执行完成"
    )
    raw_status = value.get("status")
    if raw_status == BrowserTaskStatus.NEEDS_REVIEW.value:
        status = BrowserTaskStatus.NEEDS_REVIEW
    elif value.get("ok") is True:
        status = BrowserTaskStatus.SUCCEEDED
    else:
        status = BrowserTaskStatus.FAILED
    result = value.get("result")
    return BrowserTaskExecutionResult(
        status=status,
        message=safe_message,
        result=result if isinstance(result, dict) else None,
    )


def _keep_login_page(
    task: BrowserTask,
    outcome: BrowserTaskExecutionResult,
) -> bool:
    return bool(
        task.kind is BrowserTaskKind.GET_LOGIN_QRCODE
        and outcome.status is BrowserTaskStatus.SUCCEEDED
        and outcome.result
        and outcome.result.get("is_logged_in") is False
    )


def _failure(
    message: str,
    result: dict[str, Any] | None = None,
) -> BrowserTaskExecutionResult:
    return BrowserTaskExecutionResult(
        status=BrowserTaskStatus.FAILED,
        message=message,
        result=result,
    )
