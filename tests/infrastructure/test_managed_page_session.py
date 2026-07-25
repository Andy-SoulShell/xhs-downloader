"""受管浏览器 Playwright CDP 会话基础设施测试。"""

from typing import Any

import pytest
import xhs_adapters.managed_page_session as session_module
from xhs_adapters.managed_page_session import PlaywrightCdpSession
from xhs_core.domain import ManagedBrowserError


class _Cdp:
    """返回固定无障碍树并记录浏览器协议输入。"""

    def __init__(self, nodes: list[dict[str, Any]]) -> None:
        self.nodes = nodes
        self.calls: list[tuple[str, dict[str, Any]]] = []
        self.detached = False

    async def send(self, method: str, params: dict[str, Any]) -> dict[str, Any]:
        """记录 CDP 命令并返回合成无障碍树。

        Args:
            method: 浏览器协议方法名。
            params: 已校验的固定命令参数。

        Returns:
            仅无障碍树查询返回合成节点。
        """
        self.calls.append((method, params))
        return {"nodes": self.nodes} if method == "Accessibility.getFullAXTree" else {}

    async def detach(self) -> None:
        """记录 CDP 子会话已经断开。"""
        self.detached = True


class _Context:
    """提供固定页面的合成 Playwright 上下文。"""

    def __init__(self, page: object, cdp: _Cdp | None = None) -> None:
        self.pages = [page]
        self.page = page
        self.cdp = cdp
        self.new_page_calls = 0
        self.clear_cookie_calls: list[dict[str, Any]] = []

    async def new_page(self) -> object:
        self.new_page_calls += 1
        return self.page

    async def new_cdp_session(self, page: object) -> _Cdp:
        """返回绑定固定页面的合成 CDP 子会话。

        Args:
            page: 必须与上下文固定页面一致。

        Returns:
            构造时提供的合成 CDP 子会话。

        Raises:
            AssertionError: 页面或子会话与测试脚本不一致。
        """
        assert page is self.page
        assert self.cdp is not None
        return self.cdp

    async def clear_cookies(self, **filters: Any) -> None:
        self.clear_cookie_calls.append(filters)


class _Browser:
    """提供默认上下文列表的合成 Playwright 浏览器。"""

    def __init__(self, contexts: list[_Context]) -> None:
        self.contexts = contexts


class _Chromium:
    """记录 CDP 连接参数的合成 Chromium 驱动。"""

    def __init__(self, browser: _Browser) -> None:
        self.browser = browser
        self.connect_calls: list[tuple[str, dict[str, Any]]] = []

    async def connect_over_cdp(
        self,
        endpoint: str,
        **options: Any,
    ) -> _Browser:
        self.connect_calls.append((endpoint, options))
        return self.browser


class _Playwright:
    """记录停止动作的合成 Playwright 运行时。"""

    def __init__(self, browser: _Browser) -> None:
        self.chromium = _Chromium(browser)
        self.stopped = False

    async def stop(self) -> None:
        self.stopped = True


class _Starter:
    """返回固定运行时的合成 Playwright 启动器。"""

    def __init__(self, runtime: _Playwright) -> None:
        self.runtime = runtime
        self.start_calls = 0

    async def start(self) -> _Playwright:
        self.start_calls += 1
        return self.runtime


async def test_cdp_session_requires_connection_before_page_access() -> None:
    """确保未连接会话不能读取或创建页面。"""
    session = PlaywrightCdpSession()

    with pytest.raises(ManagedBrowserError, match="尚未连接"):
        await session.pages()
    with pytest.raises(ManagedBrowserError, match="尚未连接"):
        await session.new_page()
    with pytest.raises(ManagedBrowserError, match="尚未连接"):
        await session.delete_xhs_cookies()


async def test_cdp_session_connects_loopback_and_only_stops_driver(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """确保会话连接本机端点、复用默认上下文并仅停止驱动。

    Args:
        monkeypatch: Pytest 提供的属性替换工具。
    """
    page = object()
    context = _Context(page)
    runtime = _Playwright(_Browser([context]))
    starter = _Starter(runtime)
    monkeypatch.setattr(session_module, "async_playwright", lambda: starter)
    session = PlaywrightCdpSession()

    await session.connect(19222)
    await session.connect(19222)

    assert starter.start_calls == 1
    assert runtime.chromium.connect_calls == [
        (
            "http://127.0.0.1:19222",
            {"timeout": 10_000, "is_local": True},
        )
    ]
    assert tuple(await session.pages()) == (page,)
    assert await session.new_page() is page
    assert context.new_page_calls == 1

    await session.close()

    assert runtime.stopped is True


async def test_cdp_session_clears_only_exact_xhs_cookie_domains(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """确保清理使用精确域过滤且从不枚举 Cookie。

    Args:
        monkeypatch: Pytest 提供的属性替换工具。
    """
    context = _Context(object())
    runtime = _Playwright(_Browser([context]))
    starter = _Starter(runtime)
    monkeypatch.setattr(session_module, "async_playwright", lambda: starter)
    session = PlaywrightCdpSession()

    await session.connect(19222)
    await session.delete_xhs_cookies()

    assert context.clear_cookie_calls == [
        {"domain": "xiaohongshu.com"},
        {"domain": ".xiaohongshu.com"},
    ]


async def test_cdp_session_activates_unique_focused_publish_button(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """确保语义节点聚焦后只发送一次可信 Space。

    Args:
        monkeypatch: Pytest 提供的属性替换工具。
    """
    page = object()
    cdp = _Cdp(
        [
            {
                "name": {"value": "定时发布"},
                "role": {"value": "button"},
                "backendDOMNodeId": 114,
                "properties": [{"name": "focused", "value": {"value": True}}],
            }
        ]
    )
    runtime = _Playwright(_Browser([_Context(page, cdp)]))
    monkeypatch.setattr(
        session_module,
        "async_playwright",
        lambda: _Starter(runtime),
    )
    session = PlaywrightCdpSession()

    await session.connect(19222)
    await session.activate_focused_publish_button(page)

    assert cdp.calls == [
        ("Accessibility.getFullAXTree", {"depth": -1}),
        ("DOM.focus", {"backendNodeId": 114}),
        (
            "Input.dispatchKeyEvent",
            {
                "type": "keyDown",
                "key": " ",
                "code": "Space",
                "windowsVirtualKeyCode": 32,
                "nativeVirtualKeyCode": 32,
            },
        ),
        (
            "Input.dispatchKeyEvent",
            {
                "type": "keyUp",
                "key": " ",
                "code": "Space",
                "windowsVirtualKeyCode": 32,
                "nativeVirtualKeyCode": 32,
            },
        ),
    ]
    assert cdp.detached is True


async def test_cdp_session_rejects_browser_without_default_context(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """确保缺少持久化默认上下文时断开驱动并明确失败。

    Args:
        monkeypatch: Pytest 提供的属性替换工具。
    """
    runtime = _Playwright(_Browser([]))
    starter = _Starter(runtime)
    monkeypatch.setattr(session_module, "async_playwright", lambda: starter)
    session = PlaywrightCdpSession()

    with pytest.raises(ManagedBrowserError, match="没有可用"):
        await session.connect(19222)

    assert runtime.stopped is True
