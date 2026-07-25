"""受管浏览器生命周期 HTTP API 测试。"""

from pathlib import Path

from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from xhs_adapters.config import AppSettings
from xhs_api.app import create_api
from xhs_api.managed_browser import create_managed_browser_router
from xhs_core.domain import ManagedBrowserState, ManagedBrowserStatus

from tests.interfaces.helpers import FakeService


class FakeManagedBrowser:
    """记录 API 生命周期调用的合成控制器。"""

    def __init__(self) -> None:
        """初始化停止状态。"""
        self.state = ManagedBrowserState.STOPPED
        self.calls: list[str] = []

    async def status(self) -> ManagedBrowserStatus:
        """返回当前状态。

        Returns:
            合成状态快照。
        """
        self.calls.append("status")
        return self._snapshot()

    async def start(self) -> ManagedBrowserStatus:
        """切换到运行状态。

        Returns:
            运行状态快照。
        """
        self.calls.append("start")
        self.state = ManagedBrowserState.RUNNING
        return self._snapshot(9222)

    async def stop(self) -> ManagedBrowserStatus:
        """切换到停止状态。

        Returns:
            停止状态快照。
        """
        self.calls.append("stop")
        self.state = ManagedBrowserState.STOPPED
        return self._snapshot()

    async def close(self) -> None:
        """记录生命周期关闭。"""
        self.calls.append("close")

    def _snapshot(self, port: int | None = None) -> ManagedBrowserStatus:
        return ManagedBrowserStatus(
            installed=True,
            state=self.state,
            executable_name="synthetic-chromium",
            cdp_port=port,
            owned_by_current_process=self.state is ManagedBrowserState.RUNNING,
            message="合成受管浏览器状态",
        )


async def test_managed_browser_api_controls_local_lifecycle() -> None:
    """确保本机管理端可以查询、启动和停止专用浏览器。"""
    controller = FakeManagedBrowser()
    api = FastAPI()
    api.include_router(create_managed_browser_router(controller, lambda _: True))
    async with AsyncClient(
        transport=ASGITransport(app=api),
        base_url="http://test",
    ) as client:
        initial = await client.get("/browser/managed/status")
        started = await client.post("/browser/managed/start")
        stopped = await client.post("/browser/managed/stop")

    assert initial.json()["state"] == "stopped"
    assert started.json()["state"] == "running"
    assert started.json()["cdp_host"] == "127.0.0.1"
    assert stopped.json()["state"] == "stopped"
    assert controller.calls == ["status", "start", "stop"]


async def test_managed_browser_api_rejects_non_local_management() -> None:
    """确保受管浏览器控制端点不能被非本机调用。"""
    controller = FakeManagedBrowser()
    api = FastAPI()
    api.include_router(create_managed_browser_router(controller, lambda _: False))
    async with AsyncClient(
        transport=ASGITransport(app=api),
        base_url="http://test",
    ) as client:
        response = await client.post("/browser/managed/start")

    assert response.status_code == 403
    assert controller.calls == []


async def test_main_api_exposes_managed_browser_status(tmp_path: Path) -> None:
    """确保生产装配包含受管浏览器路由且不会自动启动进程。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    api = create_api(
        AppSettings(
            work_path=tmp_path,
            managed_browser_executable=tmp_path.joinpath("missing-browser"),
        ),
        lambda _: FakeService(),
        settings_access_policy=lambda _: True,
    )
    async with (
        api.router.lifespan_context(api),
        AsyncClient(
            transport=ASGITransport(app=api),
            base_url="http://test",
        ) as client,
    ):
        response = await client.get("/browser/managed/status")

    assert response.status_code == 200
    assert response.json()["installed"] is False
    assert response.json()["state"] == "stopped"
