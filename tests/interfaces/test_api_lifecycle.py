"""API 后台 Worker 的启动、失败回滚与关闭顺序测试。"""

from types import SimpleNamespace
from typing import Any

import pytest
import xhs_api.app as app_module
from xhs_adapters.config import AppSettings
from xhs_api.app import create_api

from tests.interfaces.helpers import FakeService


class _Lifecycle:
    """按名称记录启动和关闭，可选择模拟启动失败。"""

    def __init__(
        self,
        name: str,
        events: list[str],
        *,
        fail_start: bool = False,
    ) -> None:
        """保存事件列表和启动故障开关。

        Args:
            name: 生命周期组件名称。
            events: 所有组件共享的事件列表。
            fail_start: 是否在记录启动后抛出异常。
        """
        self.name = name
        self.events = events
        self.fail_start = fail_start

    async def start(self) -> None:
        """记录启动并按配置模拟失败。

        Raises:
            RuntimeError: 测试要求模拟启动失败。
        """
        self.events.append(f"{self.name}:start")
        if self.fail_start:
            raise RuntimeError("synthetic lifecycle failure")

    async def close(self) -> None:
        """记录关闭。"""
        self.events.append(f"{self.name}:close")


def _dependencies(events: list[str], *, fail_publication: bool = False) -> Any:
    capabilities = _Lifecycle("capabilities", events)
    browser = SimpleNamespace(
        tasks=object(),
        execution=object(),
        managed=_Lifecycle("managed", events),
        worker=_Lifecycle("browser", events),
    )
    publication = SimpleNamespace(
        drafts=object(),
        tasks=object(),
        execution=object(),
        credentials=object(),
        scheduler=_Lifecycle("scheduler", events),
        worker=_Lifecycle(
            "publication",
            events,
            fail_start=fail_publication,
        ),
    )
    return SimpleNamespace(
        browser=browser,
        capabilities=capabilities,
        client_records=object(),
        download_tasks=object(),
        posts=object(),
        publication=publication,
        settings=SimpleNamespace(current=AppSettings()),
    )


def _patch_lifecycle(
    monkeypatch: pytest.MonkeyPatch,
    dependencies: Any,
    download: _Lifecycle,
) -> None:
    monkeypatch.setattr(
        app_module,
        "create_api_dependencies",
        lambda *_: dependencies,
    )
    monkeypatch.setattr(
        app_module,
        "DownloadTaskCoordinator",
        lambda *_: download,
    )


async def test_api_starts_recovery_before_workers_and_closes_in_safe_order(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """确保恢复完成后才消费任务，关闭时先断开页面再停止 Chromium。

    Args:
        monkeypatch: Pytest 属性替换工具。
    """
    events: list[str] = []
    dependencies = _dependencies(events)
    _patch_lifecycle(
        monkeypatch,
        dependencies,
        _Lifecycle("download", events),
    )
    api = create_api(AppSettings(), lambda _: FakeService())

    async with api.router.lifespan_context(api):
        events.append("app:running")

    assert events == [
        "download:start",
        "scheduler:start",
        "publication:start",
        "browser:start",
        "app:running",
        "capabilities:close",
        "publication:close",
        "browser:close",
        "managed:close",
        "scheduler:close",
        "download:close",
    ]


async def test_api_closes_all_registered_resources_after_startup_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """确保发布 Worker 启动失败也不会泄漏其他后台资源。

    Args:
        monkeypatch: Pytest 属性替换工具。
    """
    events: list[str] = []
    dependencies = _dependencies(events, fail_publication=True)
    _patch_lifecycle(
        monkeypatch,
        dependencies,
        _Lifecycle("download", events),
    )
    api = create_api(AppSettings(), lambda _: FakeService())

    with pytest.raises(RuntimeError, match="synthetic lifecycle failure"):
        async with api.router.lifespan_context(api):
            raise AssertionError("启动失败时不应进入应用上下文")

    assert events == [
        "download:start",
        "scheduler:start",
        "publication:start",
        "capabilities:close",
        "publication:close",
        "browser:close",
        "managed:close",
        "scheduler:close",
        "download:close",
    ]
