"""受管浏览器 Cookie 清理的 HTTP 到 Worker 集成测试。"""

from pathlib import Path

import pytest
import xhs_adapters.factory as factory_module
from httpx import ASGITransport, AsyncClient
from xhs_adapters.config import AppSettings
from xhs_adapters.managed_task_executor import PlaywrightManagedTaskExecutor
from xhs_api.app import create_api
from xhs_core.domain import BrowserDriver, ManagedBrowserState, ManagedBrowserStatus

from tests.infrastructure.managed_page_fakes import FakePage, FakeSession
from tests.interfaces.helpers import FakeService

_CDP_PORT = 19222


class _RunningController:
    """提供固定运行状态且不启动真实 Chromium 的合成控制器。"""

    def __init__(self) -> None:
        """初始化关闭计数。"""
        self.close_calls = 0

    async def status(self) -> ManagedBrowserStatus:
        """返回具备本机 CDP 端口的运行状态。

        Returns:
            不含本机路径和浏览数据的合成状态。
        """
        return ManagedBrowserStatus(
            installed=True,
            state=ManagedBrowserState.RUNNING,
            executable_name="synthetic-chromium",
            cdp_port=_CDP_PORT,
            owned_by_current_process=True,
            message="合成运行状态",
        )

    async def start(self) -> ManagedBrowserStatus:
        """返回已经运行的状态。

        Returns:
            合成运行状态。
        """
        return await self.status()

    async def stop(self) -> ManagedBrowserStatus:
        """返回合成停止状态。

        Returns:
            不包含 CDP 端口的停止状态。
        """
        return ManagedBrowserStatus(
            installed=True,
            state=ManagedBrowserState.STOPPED,
            executable_name="synthetic-chromium",
            message="合成停止状态",
        )

    async def close(self) -> None:
        """记录控制器资源已释放。"""
        self.close_calls += 1


async def test_managed_cookie_delete_completes_through_http_and_worker(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """确保 HTTP 提交的受管清理任务被 Worker 领取并返回正式结果。

    Args:
        tmp_path: Pytest 提供的临时目录。
        monkeypatch: Pytest 提供的属性替换工具。
    """
    controller = _RunningController()
    xhs_page = FakePage("https://www.xiaohongshu.com/explore")
    unrelated_page = FakePage("https://synthetic.invalid/")
    session = FakeSession(existing_pages=[xhs_page, unrelated_page])

    def create_controller(_: AppSettings) -> _RunningController:
        return controller

    def create_executor(
        managed: _RunningController,
    ) -> PlaywrightManagedTaskExecutor:
        return PlaywrightManagedTaskExecutor(managed, lambda: session)

    monkeypatch.setattr(factory_module, "ChromiumController", create_controller)
    monkeypatch.setattr(
        factory_module,
        "PlaywrightManagedTaskExecutor",
        create_executor,
    )
    api = create_api(
        AppSettings(
            work_path=tmp_path,
            browser_driver=BrowserDriver.MANAGED,
        ),
        lambda _: FakeService(),
        settings_file=tmp_path.joinpath(".env"),
    )

    async with (
        api.router.lifespan_context(api),
        AsyncClient(
            transport=ASGITransport(app=api),
            base_url="http://127.0.0.1:5556",
        ) as client,
    ):
        response = await client.post(
            "/xhs/login/cookies/delete?wait_seconds=2",
            json={
                "target": "browser",
                "confirmed": True,
                "request_id": "synthetic-managed-cookie-delete",
            },
        )
        task = await client.get(f"/browser/tasks/{response.json()['task_id']}")

    payload = response.json()
    assert response.status_code == 200
    assert payload["target"] == "browser"
    assert payload["status"] == "succeeded"
    assert payload["deleted"] is True
    assert payload["restart_required"] is False
    assert task.json()["target_driver"] == "managed"
    assert task.json()["result"] == {"target": "browser", "deleted": True}
    assert session.connected_ports == [_CDP_PORT]
    assert session.delete_cookie_calls == 1
    assert session.new_page_calls == 0
    assert xhs_page.closed is True
    assert unrelated_page.closed is False
    assert controller.close_calls == 1
