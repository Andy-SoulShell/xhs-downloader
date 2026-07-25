"""浏览器任务租约冲突 API 测试。"""

from httpx import ASGITransport, AsyncClient
from xhs_adapters.config import AppSettings
from xhs_api.app import create_api

from tests.interfaces.helpers import FakeService

_EXTENSION_ID = "synthetic-lease-extension"
_ORIGIN = f"chrome-extension://{_EXTENSION_ID}"


async def test_api_distinguishes_lease_conflict_from_result_validation(
    tmp_path,
) -> None:
    """租约冲突返回 409，结果结构错误仍返回普通业务错误 400。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    settings = AppSettings(work_path=tmp_path, browser_task_lease_seconds=30)
    api = create_api(settings, lambda _: FakeService())
    async with (
        api.router.lifespan_context(api),
        AsyncClient(
            transport=ASGITransport(app=api),
            base_url="http://127.0.0.1:5556",
        ) as client,
    ):
        registration = await client.post(
            "/browser/extension/register",
            json={"extension_id": _EXTENSION_ID},
            headers={"Origin": _ORIGIN},
        )
        extension_headers = {
            "Origin": _ORIGIN,
            "Authorization": f"Bearer {registration.json()['token']}",
            "X-Extension-Id": _EXTENSION_ID,
        }
        submitted = await client.post(
            "/browser/tasks",
            json={"kind": "check_login_status", "payload": {}},
        )
        claimed = await client.post(
            "/browser/extension/tasks/claim",
            headers=extension_headers,
        )
        task_id = submitted.json()["task_id"]
        valid_headers = {
            **extension_headers,
            "X-Browser-Lease": claimed.json()["lease_token"],
        }
        stale = await client.post(
            f"/browser/extension/tasks/{task_id}/status",
            json={"status": "running", "message": "陈旧租约心跳"},
            headers={
                **extension_headers,
                "X-Browser-Lease": "synthetic-invalid-lease",
            },
        )
        invalid_result = await client.post(
            f"/browser/extension/tasks/{task_id}/result",
            json={
                "status": "succeeded",
                "message": "合成错误结果",
                "result": {"logged_in": "invalid"},
            },
            headers=valid_headers,
        )
        running = await client.post(
            f"/browser/extension/tasks/{task_id}/status",
            json={"status": "running", "message": "有效租约心跳"},
            headers=valid_headers,
        )
        completed = await client.post(
            f"/browser/extension/tasks/{task_id}/result",
            json={
                "status": "succeeded",
                "message": "登录状态已读取",
                "result": {
                    "logged_in": False,
                    "user_id": None,
                    "nickname": None,
                },
            },
            headers=valid_headers,
        )
        terminal_stale = await client.post(
            f"/browser/extension/tasks/{task_id}/status",
            json={"status": "running", "message": "终态后的陈旧心跳"},
            headers=valid_headers,
        )

    assert registration.status_code == 200
    assert claimed.status_code == 200
    assert claimed.json()["lease_seconds"] == 30
    assert stale.status_code == 409
    assert invalid_result.status_code == 400
    assert "结果结构无效" in invalid_result.json()["message"]
    assert running.status_code == 200
    assert completed.status_code == 200
    assert terminal_stale.status_code == 409
