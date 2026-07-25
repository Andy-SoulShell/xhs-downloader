"""二维码登录与双会话 Cookie 管理 API 测试。"""

from httpx import ASGITransport, AsyncClient
from xhs_adapters.config import AppSettings
from xhs_api.app import create_api
from xhs_core.domain import BrowserDriver

from tests.interfaces.helpers import FakeService


async def test_login_routes_create_browser_tasks_and_require_confirmation(
    tmp_path,
) -> None:
    """确保二维码和浏览器 Cookie 清理进入受审计任务。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
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
        qrcode = await client.post(
            "/xhs/login/qrcode",
            json={"request_id": "synthetic-qrcode-request"},
        )
        deleted = await client.post(
            "/xhs/login/cookies/delete",
            json={
                "target": "browser",
                "confirmed": True,
                "request_id": "synthetic-delete-request",
            },
        )
        deleted_task = await client.get(
            f"/browser/tasks/{deleted.json()['task_id']}"
        )
        rejected = await client.post(
            "/xhs/login/cookies/delete",
            json={"target": "browser", "confirmed": False},
        )

    assert qrcode.status_code == 202
    assert qrcode.json()["kind"] == "get_login_qrcode"
    assert qrcode.json()["target_driver"] == "managed"
    assert deleted.json()["status"] == "queued"
    assert deleted.json()["task_id"]
    assert deleted_task.json()["target_driver"] == "managed"
    assert rejected.status_code == 422


async def test_http_cookie_delete_clears_config_and_reports_restart(
    tmp_path,
) -> None:
    """确保 HTTP Cookie 被清空且不会在响应中泄露。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    settings_file = tmp_path.joinpath(".env")
    settings_file.write_text(
        "XHS_COOKIE=session%3Dsynthetic\n",
        encoding="utf-8",
    )
    api = create_api(
        AppSettings(work_path=tmp_path, cookie="session=synthetic"),
        lambda _: FakeService(),
        settings_file=settings_file,
    )
    async with (
        api.router.lifespan_context(api),
        AsyncClient(
            transport=ASGITransport(app=api),
            base_url="http://127.0.0.1:5556",
        ) as client,
    ):
        response = await client.post(
            "/xhs/login/cookies/delete",
            json={"target": "http", "confirmed": True},
        )

    payload = response.json()
    assert payload == {
        "target": "http",
        "status": "succeeded",
        "deleted": True,
        "message": "HTTP Cookie 已从配置中清除，重启本地服务后生效",
        "task_id": None,
        "restart_required": True,
    }
    assert "synthetic" not in payload["message"]
    assert "XHS_COOKIE=" in settings_file.read_text(encoding="utf-8")


async def test_cookie_delete_rejects_remote_management(tmp_path) -> None:
    """确保外站页面不能触发会话清理。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    api = create_api(
        AppSettings(work_path=tmp_path),
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
            "/xhs/login/cookies/delete",
            json={"target": "http", "confirmed": True},
            headers={"Origin": "https://example.invalid"},
        )

    assert response.status_code == 403
