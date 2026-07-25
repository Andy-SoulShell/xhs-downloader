"""受管发布 Playwright 执行器使用的合成页面与会话。"""

from collections.abc import Sequence
from typing import Any

from xhs_adapters.managed_publication_contract import (
    PUBLISH_SELECTOR,
    SCHEDULE_SELECTOR,
)

_PENDING = {
    "ok": True,
    "state": "pending",
    "message": "等待创作平台确认",
}


class FakePublicationKeyboard:
    """记录官方定时浏览器键盘输入。"""

    def __init__(self, events: list[str]) -> None:
        """保存共享事件序列。

        Args:
            events: 页面所有动作共享的顺序记录。
        """
        self.events = events
        self.presses: list[tuple[str, dict[str, Any]]] = []
        self.inserted_text: list[str] = []

    async def press(self, key: str, **options: Any) -> None:
        """记录固定控制按键。

        Args:
            key: Playwright 按键名称。
            **options: 键盘按键选项。
        """
        self.events.append(f"keyboard:{key}")
        self.presses.append((key, options))

    async def insert_text(self, text: str) -> None:
        """记录官方定时时间文本。

        Args:
            text: 待写入的合成时间文本。
        """
        self.events.append("keyboard:insert")
        self.inserted_text.append(text)


class FakePublicationMouse:
    """记录封闭发布按钮的浏览器鼠标点击。"""

    def __init__(
        self,
        events: list[str],
        click_error: Exception | None = None,
    ) -> None:
        """保存共享事件和可选点击异常。

        Args:
            events: 页面所有动作共享的顺序记录。
            click_error: 鼠标点击时抛出的合成异常。
        """
        self.events = events
        self.click_error = click_error
        self.clicks: list[tuple[float, float, dict[str, Any]]] = []

    async def click(self, x: float, y: float, **options: Any) -> None:
        """记录坐标点击并按需抛出异常。

        Args:
            x: 合成视口横坐标。
            y: 合成视口纵坐标。
            **options: 鼠标点击选项。

        Raises:
            Exception: 构造时指定的合成点击异常。
        """
        self.events.append("mouse:click")
        self.clicks.append((x, y, options))
        if self.click_error:
            raise self.click_error


class FakePublicationPage:
    """按固定响应脚本模拟受管创作页面。"""

    def __init__(
        self,
        *,
        responses: dict[str, Sequence[Any]],
        click_error: Exception | None = None,
        mouse_error: Exception | None = None,
        navigated_url: str | None = None,
        adapter_version: Any = "1",
    ) -> None:
        """创建合成页面。

        Args:
            responses: 各适配器方法依次返回的结构化响应。
            click_error: 选择器点击需要抛出的合成异常。
            mouse_error: 坐标点击需要抛出的合成异常。
            navigated_url: 覆盖导航后页面地址以模拟跳转。
            adapter_version: 页面初始化后公开的适配器版本。
        """
        self._url = "about:blank"
        self._responses = {key: list(values) for key, values in responses.items()}
        self._click_error = click_error
        self._navigated_url = navigated_url
        self._adapter_version = adapter_version
        self.events: list[str] = []
        self.mouse = FakePublicationMouse(self.events, mouse_error)
        self.keyboard = FakePublicationKeyboard(self.events)
        self.goto_calls: list[tuple[str, dict[str, Any]]] = []
        self.evaluate_calls: list[tuple[str, Any]] = []
        self.file_calls: list[tuple[str, tuple[str, ...], dict[str, Any]]] = []
        self.click_calls: list[tuple[str, dict[str, Any]]] = []
        self.init_scripts: list[str] = []
        self.bring_to_front_calls = 0
        self.closed = False

    @property
    def url(self) -> str:
        """返回当前合成页面地址。

        Returns:
            导航后或测试覆盖的页面地址。
        """
        return self._url

    async def add_init_script(self, script: str) -> None:
        """记录导航前注册的构建产物。

        Args:
            script: 受管发布页面适配器源码。
        """
        self.events.append("add_init_script")
        self.init_scripts.append(script)

    async def goto(self, url: str, **options: Any) -> None:
        """记录导航并更新当前地址。

        Args:
            url: 固定创作页地址。
            **options: Playwright 导航选项。
        """
        self.events.append("goto")
        self.goto_calls.append((url, options))
        self._url = self._navigated_url or url

    async def evaluate(self, expression: str, arg: Any = None) -> Any:
        """按表达式名称返回合成适配器响应。

        Args:
            expression: 生产执行器的固定适配器表达式。
            arg: 可选发布任务字典。

        Returns:
            响应脚本中的下一项。

        Raises:
            Exception: 响应脚本明确提供的合成异常。
            AssertionError: 未知表达式或缺少响应。
        """
        key = _expression_key(expression)
        self.events.append(f"evaluate:{key}")
        self.evaluate_calls.append((expression, arg))
        if key == "version":
            if isinstance(self._adapter_version, Exception):
                raise self._adapter_version
            return self._adapter_version
        queue = self._responses.get(key, [])
        if queue:
            value = queue.pop(0)
        elif key == "observe":
            value = _PENDING
        else:
            raise AssertionError(f"合成页面缺少 {key} 响应")
        if isinstance(value, Exception):
            raise value
        if callable(value):
            return value()
        return value

    async def set_input_files(
        self,
        selector: str,
        files: Sequence[str],
        **options: Any,
    ) -> None:
        """记录固定输入框和素材顺序。

        Args:
            selector: 固定上传选择器。
            files: 素材绝对路径序列。
            **options: Playwright 上传选项。
        """
        self.events.append("set_input_files")
        self.file_calls.append((selector, tuple(files), options))

    async def click(self, selector: str, **options: Any) -> None:
        """记录官方定时或发布按钮点击。

        Args:
            selector: 固定页面选择器。
            **options: Playwright 点击选项。

        Raises:
            Exception: 发布按钮点击配置的合成异常。
        """
        event = "click:publish" if selector == PUBLISH_SELECTOR else "click:schedule"
        self.events.append(event)
        self.click_calls.append((selector, options))
        if self._click_error and selector != SCHEDULE_SELECTOR:
            raise self._click_error

    async def bring_to_front(self) -> None:
        """记录页面被置于用户前台。"""
        self.events.append("bring_to_front")
        self.bring_to_front_calls += 1

    async def close(self) -> None:
        """记录任务页面已经关闭。"""
        self.events.append("page:close")
        self.closed = True


class FakePublicationSession:
    """把单一合成页面暴露为持久化 Profile 的短会话。"""

    def __init__(self, page: FakePublicationPage) -> None:
        """保存新建页面将返回的合成页面。

        Args:
            page: 本任务唯一的创作页面。
        """
        self.page = page
        self.connected_ports: list[int] = []
        self.new_page_calls = 0
        self.closed = False

    async def connect(self, port: int) -> None:
        """记录受管 Chromium 的合成 CDP 端口。

        Args:
            port: 仅回环监听的合成端口。
        """
        self.connected_ports.append(port)

    async def new_page(self) -> FakePublicationPage:
        """返回同一合成任务页面。

        Returns:
            构造时提供的页面。
        """
        self.new_page_calls += 1
        return self.page

    async def close(self) -> None:
        """记录 Playwright 已断开但浏览器未被终止。"""
        self.closed = True


def _expression_key(expression: str) -> str:
    if "?.version" in expression:
        return "version"
    for marker, key in (
        (".prepareUpload(", "upload"),
        (".fill(", "fill"),
        (".verifySchedule(", "verify_schedule"),
        (".preparePublish(", "prepare_publish"),
        (".observeOutcome(", "observe"),
    ):
        if marker in expression:
            return key
    raise AssertionError("合成页面收到未知适配器表达式")
