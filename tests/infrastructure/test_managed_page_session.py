"""受管浏览器 Playwright CDP 会话基础设施测试。"""

from typing import Any

import pytest
import xhs_adapters.managed_page_session as session_module
from xhs_adapters.managed_page_session import PlaywrightCdpSession
from xhs_core.domain import ManagedBrowserError


class _Context:
    """提供固定页面的合成 Playwright 上下文。"""

    def __init__(self, page: object) -> None:
        self.pages = [page]
        self.page = page
        self.new_page_calls = 0

    async def new_page(self) -> object:
        self.new_page_calls += 1
        return self.page


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
