"""通用浏览器任务 HTTP API 测试。"""

import asyncio

from httpx import ASGITransport, AsyncClient
from xhs_adapters.config import AppSettings
from xhs_api.app import create_api

from tests.interfaces.helpers import FakeService

_EXTENSION_ID = "synthetic-browser-extension"
_ORIGIN = f"chrome-extension://{_EXTENSION_ID}"


async def _register(client: AsyncClient) -> dict[str, str]:
    response = await client.post(
        "/browser/extension/register",
        json={"extension_id": _EXTENSION_ID},
        headers={"Origin": _ORIGIN},
    )
    assert response.status_code == 200
    return {
        "Origin": _ORIGIN,
        "Authorization": f"Bearer {response.json()['token']}",
        "X-Extension-Id": _EXTENSION_ID,
    }


async def test_browser_api_completes_login_status_task(tmp_path) -> None:
    """确保本机任务可由扩展领取、续租并返回结构化结果。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    api = create_api(AppSettings(work_path=tmp_path), lambda _: FakeService())
    async with (
        api.router.lifespan_context(api),
        AsyncClient(
            transport=ASGITransport(app=api),
            base_url="http://127.0.0.1:5556",
        ) as client,
    ):
        submitted = await client.post(
            "/browser/tasks",
            json={
                "kind": "check_login_status",
                "payload": {},
                "request_id": "synthetic-login-check",
            },
        )
        repeated = await client.post(
            "/browser/tasks",
            json={
                "kind": "check_login_status",
                "payload": {},
                "request_id": "synthetic-login-check",
            },
        )
        headers = await _register(client)
        claimed = await client.post(
            "/browser/extension/tasks/claim",
            headers=headers,
        )
        extensions = await client.get("/browser/extensions")
        task_id = claimed.json()["task"]["task_id"]
        lease_headers = {
            **headers,
            "X-Browser-Lease": claimed.json()["lease_token"],
        }
        running = await client.post(
            f"/browser/extension/tasks/{task_id}/status",
            json={"status": "running", "message": "正在检查登录状态"},
            headers=lease_headers,
        )
        completed = await client.post(
            f"/browser/extension/tasks/{task_id}/result",
            json={
                "status": "succeeded",
                "message": "浏览器尚未登录小红书",
                "result": {
                    "logged_in": False,
                    "user_id": None,
                    "nickname": None,
                },
            },
            headers=lease_headers,
        )
        listed = await client.get("/browser/tasks")

    assert submitted.status_code == 202
    assert repeated.json()["task_id"] == submitted.json()["task_id"]
    assert running.json()["status"] == "running"
    assert completed.json()["status"] == "succeeded"
    assert completed.json()["result"]["logged_in"] is False
    assert listed.json()[0]["task_id"] == task_id
    assert extensions.json()[0]["extension_id"] == _EXTENSION_ID
    assert extensions.json()[0]["online"] is True


async def test_browser_api_enforces_local_and_extension_boundaries(
    tmp_path,
) -> None:
    """确保外站管理、伪造扩展和缺失租约请求均被拒绝。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    api = create_api(AppSettings(work_path=tmp_path), lambda _: FakeService())
    async with (
        api.router.lifespan_context(api),
        AsyncClient(
            transport=ASGITransport(app=api),
            base_url="http://127.0.0.1:5556",
        ) as client,
    ):
        hostile = await client.get(
            "/browser/tasks",
            headers={"Origin": "https://example.invalid"},
        )
        hostile_extensions = await client.get(
            "/browser/extensions",
            headers={"Origin": "https://example.invalid"},
        )
        wrong_origin = await client.post(
            "/browser/extension/register",
            json={"extension_id": _EXTENSION_ID},
            headers={"Origin": "chrome-extension://other-extension"},
        )
        unauthorized = await client.post("/browser/extension/tasks/claim")
        submitted = await client.post(
            "/browser/tasks",
            json={"kind": "check_login_status", "payload": {}},
        )
        headers = await _register(client)
        claimed = await client.post(
            "/browser/extension/tasks/claim",
            headers=headers,
        )
        no_lease = await client.post(
            f"/browser/extension/tasks/{submitted.json()['task_id']}/status",
            json={"status": "running", "message": "合成状态"},
            headers=headers,
        )

    assert hostile.status_code == 403
    assert hostile_extensions.status_code == 403
    assert wrong_origin.status_code == 403
    assert unauthorized.status_code == 401
    assert claimed.status_code == 200
    assert no_lease.status_code == 401


async def test_browser_api_rejects_remote_extension_endpoints(tmp_path) -> None:
    """确保扩展登记与令牌接口拒绝非回环连接，即使令牌本身有效。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    api = create_api(AppSettings(work_path=tmp_path), lambda _: FakeService())
    async with (
        api.router.lifespan_context(api),
        AsyncClient(
            transport=ASGITransport(app=api),
            base_url="http://127.0.0.1:5556",
        ) as local,
        AsyncClient(
            transport=ASGITransport(app=api, client=("203.0.113.9", 40001)),
            base_url="http://127.0.0.1:5556",
        ) as remote,
    ):
        headers = await _register(local)
        remote_register = await remote.post(
            "/browser/extension/register",
            json={"extension_id": _EXTENSION_ID},
            headers={"Origin": _ORIGIN},
        )
        remote_claim = await remote.post(
            "/browser/extension/tasks/claim",
            headers=headers,
        )
        local_claim = await local.post(
            "/browser/extension/tasks/claim",
            headers=headers,
        )

    assert remote_register.status_code == 403
    assert remote_claim.status_code == 403
    assert local_claim.status_code == 200


async def test_browser_api_freezes_managed_driver_before_queueing(tmp_path) -> None:
    """确保本机可以提交受管任务且扩展不能误领。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    settings = AppSettings(
        work_path=tmp_path,
        managed_browser_executable=tmp_path.joinpath("missing-browser"),
    )
    api = create_api(settings, lambda _: FakeService())
    async with (
        api.router.lifespan_context(api),
        AsyncClient(
            transport=ASGITransport(app=api),
            base_url="http://127.0.0.1:5556",
        ) as client,
    ):
        submitted = await client.post(
            "/browser/tasks",
            json={
                "kind": "check_login_status",
                "payload": {},
                "target_driver": "managed",
            },
        )
        headers = await _register(client)
        extension_claim = await client.post(
            "/browser/extension/tasks/claim?wait_seconds=0",
            headers=headers,
        )

    assert submitted.status_code == 202
    assert submitted.json()["target_driver"] == "managed"
    assert extension_claim.status_code == 200
    assert extension_claim.json() is None


async def test_browser_api_long_poll_wakes_and_validates_wait_range(
    tmp_path,
) -> None:
    """确保扩展长轮询被新任务唤醒且等待范围由接口严格校验。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    api = create_api(AppSettings(work_path=tmp_path), lambda _: FakeService())
    async with (
        api.router.lifespan_context(api),
        AsyncClient(
            transport=ASGITransport(app=api),
            base_url="http://127.0.0.1:5556",
        ) as client,
    ):
        headers = await _register(client)
        waiting = asyncio.create_task(
            client.post(
                "/browser/extension/tasks/claim?wait_seconds=1",
                headers=headers,
            )
        )
        await asyncio.sleep(0.02)
        assert not waiting.done()

        submitted = await client.post(
            "/browser/tasks",
            json={"kind": "check_login_status", "payload": {}},
        )
        claimed = await asyncio.wait_for(waiting, 0.5)
        immediate = await client.post(
            "/browser/extension/tasks/claim",
            headers=headers,
        )
        too_short = await client.post(
            "/browser/extension/tasks/claim?wait_seconds=-0.01",
            headers=headers,
        )
        too_long = await client.post(
            "/browser/extension/tasks/claim?wait_seconds=30.01",
            headers=headers,
        )

    assert claimed.status_code == 200
    assert claimed.json()["task"]["task_id"] == submitted.json()["task_id"]
    assert immediate.status_code == 200
    assert immediate.json() is None
    assert too_short.status_code == 422
    assert too_long.status_code == 422
