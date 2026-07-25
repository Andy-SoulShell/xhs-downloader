"""面向 WebUI 与 MCP 的类型化浏览器能力 API。"""

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import JsonValue
from xhs_core.application import BrowserTaskService
from xhs_core.domain import BrowserTask, BrowserTaskKind

from .browser_operation_models import (
    BrowserOperationRequest,
    FeedDetailRequest,
    SearchFeedsRequest,
    UserProfileRequest,
)
from .settings import SettingsAccessPolicy


def create_browser_operation_router(
    tasks: BrowserTaskService,
    management_access: SettingsAccessPolicy,
) -> APIRouter:
    """创建类型化浏览器能力路由。

    Args:
        tasks: 浏览器任务提交与等待用例。
        management_access: 本机管理端访问判定策略。

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
        task = await tasks.submit(kind, payload, request_id)
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

    @router.post("/feeds/list", response_model=BrowserTask, status_code=202)
    async def list_feeds(
        payload: BrowserOperationRequest,
        request: Request,
        wait_seconds: float = Query(default=0, ge=0, le=60),
    ) -> BrowserTask:
        require_management(request)
        return await submit(
            BrowserTaskKind.LIST_FEEDS,
            {},
            payload.request_id,
            wait_seconds,
        )

    @router.post("/feeds/search", response_model=BrowserTask, status_code=202)
    async def search_feeds(
        payload: SearchFeedsRequest,
        request: Request,
        wait_seconds: float = Query(default=0, ge=0, le=60),
    ) -> BrowserTask:
        require_management(request)
        data = payload.model_dump(mode="json", exclude={"request_id"})
        return await submit(
            BrowserTaskKind.SEARCH_FEEDS,
            data,
            payload.request_id,
            wait_seconds,
        )

    @router.post("/feeds/detail", response_model=BrowserTask, status_code=202)
    async def feed_detail(
        payload: FeedDetailRequest,
        request: Request,
        wait_seconds: float = Query(default=0, ge=0, le=60),
    ) -> BrowserTask:
        require_management(request)
        data = payload.model_dump(mode="json", exclude={"request_id"})
        return await submit(
            BrowserTaskKind.GET_FEED_DETAIL,
            data,
            payload.request_id,
            wait_seconds,
        )

    @router.post("/user/profile", response_model=BrowserTask, status_code=202)
    async def user_profile(
        payload: UserProfileRequest,
        request: Request,
        wait_seconds: float = Query(default=0, ge=0, le=60),
    ) -> BrowserTask:
        require_management(request)
        data = payload.model_dump(mode="json", exclude={"request_id"})
        return await submit(
            BrowserTaskKind.GET_USER_PROFILE,
            data,
            payload.request_id,
            wait_seconds,
        )

    @router.post("/user/me", response_model=BrowserTask, status_code=202)
    async def my_profile(
        payload: BrowserOperationRequest,
        request: Request,
        wait_seconds: float = Query(default=0, ge=0, le=60),
    ) -> BrowserTask:
        require_management(request)
        return await submit(
            BrowserTaskKind.GET_MY_PROFILE,
            {},
            payload.request_id,
            wait_seconds,
        )

    return router
