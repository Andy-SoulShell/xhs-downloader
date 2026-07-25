"""受管 Chromium 的本机生命周期接口。"""

from fastapi import APIRouter, HTTPException, Request
from xhs_core.domain import ManagedBrowserStatus
from xhs_core.domain.browser_ports import ManagedBrowserController

from .settings import SettingsAccessPolicy


def create_managed_browser_router(
    controller: ManagedBrowserController,
    access_policy: SettingsAccessPolicy,
) -> APIRouter:
    """创建受管浏览器状态、启动和停止接口。

    Args:
        controller: 专用 Chromium 生命周期控制器。
        access_policy: 本机管理端访问判定策略。

    Returns:
        仅允许回环管理请求调用的路由。
    """
    router = APIRouter(prefix="/browser/managed", tags=["受管浏览器"])

    @router.get("/status", response_model=ManagedBrowserStatus)
    async def status(request: Request) -> ManagedBrowserStatus:
        _require_access(request, access_policy)
        return await controller.status()

    @router.post("/start", response_model=ManagedBrowserStatus)
    async def start(request: Request) -> ManagedBrowserStatus:
        _require_access(request, access_policy)
        return await controller.start()

    @router.post("/stop", response_model=ManagedBrowserStatus)
    async def stop(request: Request) -> ManagedBrowserStatus:
        _require_access(request, access_policy)
        return await controller.stop()

    return router


def _require_access(
    request: Request,
    access_policy: SettingsAccessPolicy,
) -> None:
    if not access_policy(request):
        raise HTTPException(
            status_code=403,
            detail="受管浏览器仅允许从本机管理",
        )
