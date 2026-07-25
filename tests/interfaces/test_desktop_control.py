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
