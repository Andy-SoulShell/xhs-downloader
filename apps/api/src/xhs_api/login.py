"""二维码登录与双会话 Cookie 管理 API。"""

from collections.abc import Callable

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query, Request
from xhs_core.application import BrowserTaskService
from xhs_core.domain import (
    BrowserDriver,
    BrowserTask,
    BrowserTaskKind,
    BrowserTaskStatus,
)

from .browser_operation_models import BrowserOperationRequest
from .login_models import DeleteCookiesRequest, DeleteCookiesResponse
from .settings import SettingsAccessPolicy
from .settings_service import SettingsManager


def create_login_router(
    tasks: BrowserTaskService,
    settings: SettingsManager,
    browser_driver: Callable[[], BrowserDriver],
    management_access: SettingsAccessPolicy,
) -> APIRouter:
    """创建普通用户登录会话路由。

    Args:
        tasks: 浏览器任务提交与等待用例。
        settings: HTTP Cookie 配置管理用例。
        browser_driver: 返回当前登录会话使用的浏览器驱动。
        management_access: 本机管理端访问判定策略。

    Returns:
        可挂载到主应用的登录会话路由。
    """
    router = APIRouter(prefix="/xhs/login", tags=["小红书登录"])

    def require_management(request: Request) -> None:
        if not management_access(request):
            raise HTTPException(status_code=403, detail="登录管理仅允许从本机访问")

    @router.post("/qrcode", response_model=BrowserTask, status_code=202)
    async def login_qrcode(
        payload: BrowserOperationRequest,
        request: Request,
        background_tasks: BackgroundTasks,
        wait_seconds: float = Query(default=0, ge=0, le=60),
    ) -> BrowserTask:
        require_management(request)
        task = await tasks.submit(
            BrowserTaskKind.GET_LOGIN_QRCODE,
            {},
            payload.request_id,
            browser_driver(),
        )
        completed = await tasks.wait(task.task_id, wait_seconds)
        if (
            completed.status is BrowserTaskStatus.SUCCEEDED
            and completed.result
            and completed.result.get("image_data_url")
        ):
            background_tasks.add_task(
                tasks.consume_login_qrcode,
                completed.task_id,
            )
        return completed

    @router.post("/cookies/delete", response_model=DeleteCookiesResponse)
    async def delete_cookies(
        payload: DeleteCookiesRequest,
        request: Request,
        wait_seconds: float = Query(default=0, ge=0, le=60),
    ) -> DeleteCookiesResponse:
        require_management(request)
        if payload.target == "http":
            return await _delete_http_cookie(settings)
        task = await tasks.submit(
            BrowserTaskKind.DELETE_COOKIES,
            {"confirmed": payload.confirmed},
            payload.request_id,
            browser_driver(),
        )
        completed = await tasks.wait(task.task_id, wait_seconds)
        return DeleteCookiesResponse(
            target="browser",
            status=completed.status,
            deleted=bool(completed.result and completed.result.get("deleted")),
            message=completed.message,
            task_id=completed.task_id,
        )

    return router


async def _delete_http_cookie(
    settings: SettingsManager,
) -> DeleteCookiesResponse:
    current = await settings.get()
    if "cookie" in current.overridden_fields:
        raise HTTPException(
            status_code=409,
            detail="HTTP Cookie 被环境变量或启动参数覆盖，请先移除覆盖项",
        )
    updated = await settings.update({"cookie": ""})
    return DeleteCookiesResponse(
        target="http",
        status=BrowserTaskStatus.SUCCEEDED,
        deleted=True,
        message=(
            "HTTP Cookie 已从配置中清除，重启本地服务后生效"
            if updated.restart_required
            else "HTTP Cookie 已清除，新请求已使用更新后的配置"
        ),
        restart_required=updated.restart_required,
    )
