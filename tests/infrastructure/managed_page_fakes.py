"""受管浏览器页面执行器使用的合成基础设施。"""

from collections.abc import Sequence
from datetime import UTC, datetime
from typing import Any

from pydantic import JsonValue
from xhs_core.domain import (
    BrowserDriver,
    BrowserTask,
    BrowserTaskKind,
    BrowserTaskStatus,
    ManagedBrowserState,
    ManagedBrowserStatus,
)
from xhs_core.domain.browser_requests import validate_browser_task_payload


class FakeController:
    """返回固定脱敏状态的合成受管浏览器控制器。"""

    def __init__(self, browser_status: ManagedBrowserStatus) -> None:
        """保存待返回状态。

        Args:
            browser_status: 合成的受管浏览器状态。
        """
        self.browser_status = browser_status
        self.status_calls = 0

    async def status(self) -> ManagedBrowserStatus:
        """返回固定状态并记录调用次数。

        Returns:
            构造时传入的受管浏览器状态。
        """
        self.status_calls += 1
        return self.browser_status


class FakePage:
    """记录导航、适配器执行和页面生命周期的合成页面。"""

    def __init__(
        self,
        url: str = "about:blank",
        *,
        responses: Sequence[dict[str, Any]] = (),
        click_error: Exception | None = None,
        close_error: Exception | None = None,
    ) -> None:
        """创建具有固定响应序列的页面。

        Args:
            url: 页面初始地址。
            responses: 每次执行页面适配器时依次返回的结构化响应。
            click_error: 浏览器级点击需要模拟抛出的异常。
            close_error: 页面关闭需要模拟抛出的异常。
        """
        self._url = url
        self._responses = list(responses)
        self._click_error = click_error
        self._close_error = close_error
        self.goto_calls: list[tuple[str, dict[str, Any]]] = []
        self.execute_args: list[dict[str, Any]] = []
        self.execute_expressions: list[str] = []
        self.click_calls: list[tuple[str, dict[str, Any]]] = []
        self.injection_count = 0
        self.diagnostics_count = 0
        self.closed = False
        self.bring_to_front_calls = 0
        self.diagnostics = {
            "adapter_version": "synthetic-adapter",
            "page_kind": "synthetic-page",
        }

    @property
    def url(self) -> str:
        """返回当前合成页面地址。

        Returns:
            最近一次导航后的地址。
        """
        return self._url

    async def goto(self, url: str, **options: Any) -> None:
        """记录一次页面导航。

        Args:
            url: 已由生产代码验证的目标地址。
            **options: 页面就绪阶段和超时配置。
        """
        self.goto_calls.append((url, options))
        self._url = url

    async def evaluate(self, expression: str, arg: Any = None) -> Any:
        """模拟注入适配器、执行任务和读取诊断。

        Args:
            expression: 生产执行器提供的固定表达式或适配器源码。
            arg: 传给页面适配器的结构化任务。

        Returns:
            当前表达式对应的合成返回值。

        Raises:
            AssertionError: 页面适配器执行次数超过响应序列。
        """
        if expression.startswith("(task) =>"):
            if not isinstance(arg, dict):
                raise AssertionError("页面任务输入应为结构化字典")
            self.execute_args.append(arg)
            self.execute_expressions.append(expression)
            if not self._responses:
                raise AssertionError("合成页面缺少任务响应")
            return self._responses.pop(0)
        if expression.startswith("() => window.") and ".diagnostics()" in expression:
            self.diagnostics_count += 1
            return self.diagnostics
        if expression.startswith("() => new Promise"):
            return None
        self.injection_count += 1
        return None

    async def click(self, selector: str, **options: Any) -> None:
        """记录一次浏览器级可信点击。

        Args:
            selector: 经过执行器复核的互动控件选择器。
            **options: Playwright 点击选项。

        Raises:
            Exception: 构造页面时指定的合成点击异常。
        """
        self.click_calls.append((selector, options))
        if self._click_error:
            raise self._click_error

    async def close(self) -> None:
        """记录页面已关闭。

        Raises:
            Exception: 构造页面时指定的合成关闭异常。
        """
        if self._close_error:
            raise self._close_error
        self.closed = True

    async def bring_to_front(self) -> None:
        """记录页面已置于前台。"""
        self.bring_to_front_calls += 1


class FakeSession:
    """提供现有页面和固定任务页面的合成 CDP 会话。"""

    def __init__(
        self,
        *,
        existing_pages: Sequence[FakePage] = (),
        task_page: FakePage | None = None,
        delete_cookie_error: Exception | None = None,
        pages_error: Exception | None = None,
    ) -> None:
        """保存会话页面。

        Args:
            existing_pages: 连接时已经打开的页面。
            task_page: 新建任务页面时返回的页面。
            delete_cookie_error: Cookie 清理需要模拟抛出的异常。
            pages_error: 页面快照读取需要模拟抛出的异常。
        """
        self._existing_pages = tuple(existing_pages)
        self.task_page = task_page or FakePage()
        self._delete_cookie_error = delete_cookie_error
        self._pages_error = pages_error
        self.connected_ports: list[int] = []
        self.new_page_calls = 0
        self.delete_cookie_calls = 0
        self.closed = False

    async def connect(self, port: int) -> None:
        """记录连接的回环 CDP 端口。

        Args:
            port: Chromium 提供的本机端口。
        """
        self.connected_ports.append(port)

    async def pages(self) -> Sequence[FakePage]:
        """返回连接前已经打开的页面。

        Returns:
            不可变的合成页面序列。

        Raises:
            Exception: 构造会话时指定的合成页面读取异常。
        """
        if self._pages_error:
            raise self._pages_error
        return self._existing_pages

    async def new_page(self) -> FakePage:
        """返回固定任务页面。

        Returns:
            构造时提供的合成页面。
        """
        self.new_page_calls += 1
        return self.task_page

    async def delete_xhs_cookies(self) -> None:
        """记录一次不读取 Cookie 值的精确域清理。

        Raises:
            Exception: 构造会话时指定的合成清理异常。
        """
        self.delete_cookie_calls += 1
        if self._delete_cookie_error:
            raise self._delete_cookie_error

    async def close(self) -> None:
        """记录自动化会话已经断开。"""
        self.closed = True


def synthetic_browser_status(
    state: ManagedBrowserState = ManagedBrowserState.RUNNING,
    *,
    cdp_port: int = 19222,
) -> ManagedBrowserStatus:
    """构造不含本机信息的受管浏览器状态。

    Args:
        state: 待模拟的浏览器生命周期状态。
        cdp_port: 运行状态使用的合成 CDP 端口。

    Returns:
        可供合成控制器返回的脱敏状态。
    """
    return ManagedBrowserStatus(
        installed=True,
        state=state,
        executable_name="synthetic-chromium",
        cdp_port=cdp_port if state is ManagedBrowserState.RUNNING else None,
        message="合成状态",
    )


def synthetic_browser_task(
    kind: BrowserTaskKind,
    payload: dict[str, JsonValue] | None = None,
    *,
    driver: BrowserDriver = BrowserDriver.MANAGED,
) -> BrowserTask:
    """构造固定为运行态的合成浏览器任务。

    Args:
        kind: 浏览器任务类型。
        payload: 不含真实内容的结构化输入。
        driver: 提交时冻结的浏览器驱动。

    Returns:
        可供受管页面执行器使用的任务。
    """
    now = datetime(2026, 1, 1, tzinfo=UTC)
    return BrowserTask(
        task_id=f"synthetic-{kind.value}",
        kind=kind,
        payload=validate_browser_task_payload(kind, payload or {}),
        target_driver=driver,
        status=BrowserTaskStatus.RUNNING,
        created_at=now,
        updated_at=now,
    )


def successful_page_response(result: dict[str, Any]) -> dict[str, Any]:
    """构造页面适配器成功响应。

    Args:
        result: 完全合成的结构化任务结果。

    Returns:
        页面执行器能够解析的成功响应。
    """
    return {
        "ok": True,
        "status": "succeeded",
        "message": "合成任务完成",
        "result": result,
    }
