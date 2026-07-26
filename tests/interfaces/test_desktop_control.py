"""桌面控制与实例身份测试。"""

from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from xhs_api.desktop import _load_or_create_instance_id
from xhs_api.desktop_control import create_desktop_control_router


async def test_desktop_identity_and_shutdown_are_loopback_only(tmp_path) -> None:
    """确保重复启动可核对实例，并能从 WebUI 优雅退出。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    instance_id = _load_or_create_instance_id(tmp_path)
    stopped: list[bool] = []
    api = FastAPI()
    api.include_router(
        create_desktop_control_router(
            instance_id,
            lambda: stopped.append(True),
        )
    )

    async with AsyncClient(
        transport=ASGITransport(app=api, client=("127.0.0.1", 45000)),
        base_url="http://127.0.0.1",
    ) as client:
        identity = await client.get("/desktop/identity")
        shutdown = await client.post("/desktop/shutdown")

    assert identity.json() == {"instance_id": instance_id}
    assert shutdown.json() == {"message": "本地服务正在安全退出"}
    assert stopped == [True]
    assert _load_or_create_instance_id(tmp_path) == instance_id


async def test_desktop_control_rejects_remote_clients() -> None:
    """确保远程页面不能探测或关闭桌面服务。"""
    api = FastAPI()
    api.include_router(
        create_desktop_control_router(
            "synthetic-instance",
            lambda: None,
        )
    )

    async with AsyncClient(
        transport=ASGITransport(app=api, client=("198.51.100.8", 45000)),
        base_url="http://198.51.100.8",
    ) as client:
        response = await client.post("/desktop/shutdown")

    assert response.status_code == 403


async def test_restart_endpoint_exists_only_when_supported(tmp_path) -> None:
    """确保提供重启回调时才暴露重启端点，且限定本机访问。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    restarts: list[bool] = []
    supported = FastAPI()
    supported.include_router(
        create_desktop_control_router(
            _load_or_create_instance_id(tmp_path),
            lambda: None,
            request_restart=lambda: restarts.append(True),
        )
    )
    plain = FastAPI()
    plain.include_router(
        create_desktop_control_router("synthetic-instance", lambda: None)
    )

    async with AsyncClient(
        transport=ASGITransport(app=supported, client=("127.0.0.1", 45000)),
        base_url="http://127.0.0.1",
    ) as client:
        restarted = await client.post("/desktop/restart")
    async with AsyncClient(
        transport=ASGITransport(app=supported, client=("198.51.100.8", 45000)),
        base_url="http://198.51.100.8",
    ) as remote:
        rejected = await remote.post("/desktop/restart")
    async with AsyncClient(
        transport=ASGITransport(app=plain, client=("127.0.0.1", 45000)),
        base_url="http://127.0.0.1",
    ) as without:
        missing = await without.post("/desktop/restart")

    assert restarted.json() == {"message": "本地服务正在重启"}
    assert restarts == [True]
    assert rejected.status_code == 403
    assert missing.status_code == 404
