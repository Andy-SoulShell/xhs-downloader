"""浏览器扩展登记与令牌接口的安全边界测试。"""

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


async def test_browser_api_revokes_extension_registration(tmp_path) -> None:
    """确保本机可注销扩展登记且旧令牌随即失效。

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
        revoked = await client.delete(f"/browser/extensions/{_EXTENSION_ID}")
        stale_claim = await client.post(
            "/browser/extension/tasks/claim",
            headers=headers,
        )
        missing = await client.delete(f"/browser/extensions/{_EXTENSION_ID}")
        hostile = await client.delete(
            f"/browser/extensions/{_EXTENSION_ID}",
            headers={"Origin": "https://example.invalid"},
        )

    assert revoked.status_code == 204
    assert stale_claim.status_code == 401
    assert missing.status_code == 404
    assert hostile.status_code == 403


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
