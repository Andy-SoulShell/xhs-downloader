"""面向 WebUI 与 MCP 的类型化浏览器能力 API。"""

from collections.abc import Callable

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import JsonValue
from xhs_core.application import BrowserReadinessProbe, BrowserTaskService
from xhs_core.domain import BrowserDriver, BrowserTask, BrowserTaskKind

from .browser_operation_models import (
    BrowserOperationRequest,
    CommentRequest,
    DesiredStateRequest,
    ReplyCommentRequest,
)
from .settings import SettingsAccessPolicy


def create_browser_operation_router(
    tasks: BrowserTaskService,
    browser_driver: Callable[[], BrowserDriver],
    management_access: SettingsAccessPolicy,
    readiness: BrowserReadinessProbe,
) -> APIRouter:
    """创建类型化浏览器能力路由。

    Args:
        tasks: 浏览器任务提交与等待用例。
        browser_driver: 返回当前写操作与登录检查所用浏览器驱动。
        management_access: 本机管理端访问判定策略。
        readiness: 提交前的驱动就绪探针。

    Returns:
        可挂载到主应用的浏览器能力路由。
    """
    router = APIRouter(prefix="/xhs", tags=["小红书浏览能力"])

    async def submit(
        kind: BrowserTaskKind,
        payload: dict[str, JsonValue],
        request_id: str | None,
        wait_seconds: float,
    ) -> BrowserTask:
        driver = browser_driver()
        # 先确认驱动能接单
        # 派给没启动的执行器只会得到一句泛化失败, 用户看不出原因, 重试也不会成功
        await readiness.ensure_available(driver)
        task = await tasks.submit(kind, payload, request_id, driver)
        return await tasks.wait(task.task_id, wait_seconds)

    def require_management(request: Request) -> None:
        if not management_access(request):
            raise HTTPException(status_code=403, detail="浏览能力仅允许从本机管理")

    @router.post("/login/status", response_model=BrowserTask, status_code=202)
    async def login_status(
        payload: BrowserOperationRequest,
        request: Request,
        wait_seconds: float = Query(default=0, ge=0, le=60),
    ) -> BrowserTask:
        require_management(request)
        return await submit(
            BrowserTaskKind.CHECK_LOGIN_STATUS,
            {},
            payload.request_id,
            wait_seconds,
        )

    @router.post("/feeds/like", response_model=BrowserTask, status_code=202)
    async def set_like(
        payload: DesiredStateRequest,
        request: Request,
        wait_seconds: float = Query(default=0, ge=0, le=60),
    ) -> BrowserTask:
        require_management(request)
        data = payload.model_dump(mode="json", exclude={"request_id"})
        return await submit(
            BrowserTaskKind.SET_LIKE,
            data,
            payload.request_id,
            wait_seconds,
        )

    @router.post("/feeds/favorite", response_model=BrowserTask, status_code=202)
    async def set_favorite(
        payload: DesiredStateRequest,
        request: Request,
        wait_seconds: float = Query(default=0, ge=0, le=60),
    ) -> BrowserTask:
        require_management(request)
        data = payload.model_dump(mode="json", exclude={"request_id"})
        return await submit(
            BrowserTaskKind.SET_FAVORITE,
            data,
            payload.request_id,
            wait_seconds,
        )

    @router.post("/feeds/comment", response_model=BrowserTask, status_code=202)
    async def post_comment(
        payload: CommentRequest,
        request: Request,
        wait_seconds: float = Query(default=0, ge=0, le=60),
    ) -> BrowserTask:
        require_management(request)
        data = payload.model_dump(mode="json", exclude={"request_id"})
        return await submit(
            BrowserTaskKind.POST_COMMENT,
            data,
            payload.request_id,
            wait_seconds,
        )

    @router.post(
        "/feeds/comment/reply",
        response_model=BrowserTask,
        status_code=202,
    )
    async def reply_comment(
        payload: ReplyCommentRequest,
        request: Request,
        wait_seconds: float = Query(default=0, ge=0, le=60),
    ) -> BrowserTask:
        require_management(request)
        data = payload.model_dump(mode="json", exclude={"request_id"})
        return await submit(
            BrowserTaskKind.REPLY_COMMENT,
            data,
            payload.request_id,
            wait_seconds,
        )

    return router
