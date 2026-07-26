"""桌面实例身份与优雅退出端点。"""

from collections.abc import Callable

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from .settings import SettingsAccessPolicy, allow_loopback_settings


class DesktopIdentity(BaseModel):
    """桌面实例身份响应。"""

    instance_id: str


class DesktopShutdownResponse(BaseModel):
    """桌面服务退出或重启响应。"""

    message: str


def create_desktop_control_router(
    instance_id: str,
    request_shutdown: Callable[[], None],
    access_policy: SettingsAccessPolicy = allow_loopback_settings,
    *,
    request_restart: Callable[[], None] | None = None,
) -> APIRouter:
    """创建仅限本机使用的桌面控制路由。

    Args:
        instance_id: 当前安装目录持久化的随机实例标识。
        request_shutdown: 响应发出后请求服务器优雅退出的回调。
        access_policy: 本机来源校验策略。
        request_restart: 响应发出后请求就地重启的回调；省略时不提供重启。

    Returns:
        可挂载到一体化桌面 API 的路由。
    """
    router = APIRouter(prefix="/desktop", tags=["桌面"])

    @router.get("/identity", response_model=DesktopIdentity)
    async def identity(request: Request) -> DesktopIdentity:
        _require_loopback(request, access_policy)
        return DesktopIdentity(instance_id=instance_id)

    @router.post("/shutdown", response_model=DesktopShutdownResponse)
    async def shutdown(request: Request) -> DesktopShutdownResponse:
        _require_loopback(request, access_policy)
        request_shutdown()
        return DesktopShutdownResponse(message="本地服务正在安全退出")

    if request_restart is not None:

        @router.post("/restart", response_model=DesktopShutdownResponse)
        async def restart(request: Request) -> DesktopShutdownResponse:
            _require_loopback(request, access_policy)
            request_restart()
            return DesktopShutdownResponse(message="本地服务正在重启")

    return router


def _require_loopback(
    request: Request,
    access_policy: SettingsAccessPolicy,
) -> None:
    if not access_policy(request):
        raise HTTPException(status_code=403, detail="桌面控制仅允许从本机访问")
