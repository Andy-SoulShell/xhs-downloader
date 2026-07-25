"""HTTP、扩展与受管浏览器共用的只读能力 API。"""

from fastapi import APIRouter, HTTPException, Request
from xhs_core.application import AtomicClientSlot
from xhs_core.domain import (
    FeedDetailResult,
    FeedListResult,
    ProviderKind,
    RoutedCapabilityResult,
    UserProfileResult,
)
from xhs_core.domain.browser_requests import SearchFilters

from .browser_operation_models import (
    BrowserOperationRequest,
    FeedDetailRequest,
    SearchFeedsRequest,
    UserProfileRequest,
)
from .capability_models import (
    ProviderFailureResponse,
    RoutedReadResponse,
    RouteTraceResponse,
)
from .capability_runtime import ReadCapabilityRuntime
from .settings import SettingsAccessPolicy


def create_capability_read_router(
    runtimes: AtomicClientSlot[ReadCapabilityRuntime],
    management_access: SettingsAccessPolicy,
) -> APIRouter:
    """创建会固定租用一份配置快照的统一只读路由。

    Args:
        runtimes: 支持排空后原子替换的只读运行时槽。
        management_access: 本机管理端访问判定策略。

    Returns:
        可挂载到主应用的统一只读能力路由。
    """
    router = APIRouter(prefix="/xhs", tags=["小红书只读能力"])

    def require_management(request: Request) -> None:
        if not management_access(request):
            raise HTTPException(status_code=403, detail="浏览能力仅允许从本机管理")

    @router.post("/feeds/list", response_model=RoutedReadResponse[FeedListResult])
    async def list_feeds(
        payload: BrowserOperationRequest,
        request: Request,
    ) -> RoutedReadResponse[FeedListResult]:
        require_management(request)
        async with runtimes.lease() as runtime:
            result = await runtime.list_feeds(payload.request_id)
            return _response(result, runtime)

    @router.post("/feeds/search", response_model=RoutedReadResponse[FeedListResult])
    async def search_feeds(
        payload: SearchFeedsRequest,
        request: Request,
    ) -> RoutedReadResponse[FeedListResult]:
        require_management(request)
        async with runtimes.lease() as runtime:
            result = await runtime.search_feeds(
                payload.keyword,
                SearchFilters.model_validate(payload.filters),
                payload.request_id,
            )
            return _response(result, runtime)

    @router.post(
        "/feeds/detail",
        response_model=RoutedReadResponse[FeedDetailResult],
    )
    async def feed_detail(
        payload: FeedDetailRequest,
        request: Request,
    ) -> RoutedReadResponse[FeedDetailResult]:
        require_management(request)
        async with runtimes.lease() as runtime:
            result = await runtime.get_feed_detail(
                payload.feed_id,
                payload.xsec_token,
                comment_limit=payload.comment_limit,
                include_replies=payload.include_replies,
                reply_limit=payload.reply_limit,
                request_id=payload.request_id,
            )
            return _response(result, runtime)

    @router.post(
        "/user/profile",
        response_model=RoutedReadResponse[UserProfileResult],
    )
    async def user_profile(
        payload: UserProfileRequest,
        request: Request,
    ) -> RoutedReadResponse[UserProfileResult]:
        require_management(request)
        async with runtimes.lease() as runtime:
            result = await runtime.get_user_profile(
                payload.user_id,
                payload.xsec_token,
                payload.request_id,
            )
            return _response(result, runtime)

    @router.post("/user/me", response_model=RoutedReadResponse[UserProfileResult])
    async def my_profile(
        payload: BrowserOperationRequest,
        request: Request,
    ) -> RoutedReadResponse[UserProfileResult]:
        require_management(request)
        async with runtimes.lease() as runtime:
            result = await runtime.get_my_profile(payload.request_id)
            return _response(result, runtime)

    return router


def _response[ResultT](
    result: RoutedCapabilityResult[ResultT],
    runtime: ReadCapabilityRuntime,
) -> RoutedReadResponse[ResultT]:
    failure = result.fallback_reason
    browser_attempted = ProviderKind.BROWSER in result.attempted_providers
    return RoutedReadResponse(
        data=result.value,
        route=RouteTraceResponse(
            provider=result.provider,
            strategy=result.strategy,
            browser_driver=runtime.browser_driver if browser_attempted else None,
            fallback_used=result.fallback_used,
            fallback_reason=(
                ProviderFailureResponse(
                    provider=failure.provider,
                    code=failure.code,
                    message=failure.message,
                )
                if failure
                else None
            ),
            attempted_providers=list(result.attempted_providers),
            account_consistency=result.account_consistency,
        ),
    )
