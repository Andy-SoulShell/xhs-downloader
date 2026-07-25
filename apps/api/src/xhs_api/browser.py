"""本机管理端与浏览器扩展协作的通用任务 API。"""

from base64 import urlsafe_b64encode
from datetime import UTC, datetime, timedelta
from ipaddress import ip_address
from urllib.parse import urlsplit

from fastapi import APIRouter, HTTPException, Query, Request, Response
from xhs_core.application import (
    BrowserExecutionService,
    BrowserTaskService,
    ExtensionAccountChallengeChannel,
    ExtensionCredentialService,
)
from xhs_core.domain import AccountProof, BrowserDriver, BrowserTask, BrowserTaskClaim

from .browser_models import (
    BrowserAccountChallengeAnswerRequest,
    BrowserAccountChallengeClaimResponse,
    BrowserExtensionRegisterRequest,
    BrowserExtensionStatus,
    BrowserExtensionTokenResponse,
    BrowserTaskRequest,
    BrowserTaskResultRequest,
    BrowserTaskStatusRequest,
)
from .settings import SettingsAccessPolicy

_EXTENSION_SCHEMES = {
    "chrome-extension",
    "moz-extension",
    "safari-web-extension",
}
_ONLINE_GRACE = timedelta(seconds=75)


def create_browser_router(
    tasks: BrowserTaskService,
    execution: BrowserExecutionService,
    credentials: ExtensionCredentialService,
    account_challenges: ExtensionAccountChallengeChannel,
    management_access: SettingsAccessPolicy,
) -> APIRouter:
    """创建浏览器任务管理与扩展执行路由。

    Args:
        tasks: 浏览器任务提交与管理用例。
        execution: 扩展领取和状态回传用例。
        credentials: 扩展能力凭据用例。
        account_challenges: 不经过任务仓储的一次性账号证明通道。
        management_access: 本机管理端访问判定策略。

    Returns:
        可挂载到主应用的浏览器任务路由。
    """
    router = APIRouter(prefix="/browser", tags=["浏览器任务"])

    @router.post("/tasks", response_model=BrowserTask, status_code=202)
    async def submit_task(
        payload: BrowserTaskRequest,
        request: Request,
    ) -> BrowserTask:
        _require_management(request, management_access)
        return await tasks.submit(
            payload.kind,
            payload.payload,
            payload.request_id,
            payload.target_driver,
        )

    @router.get("/tasks", response_model=list[BrowserTask])
    async def list_tasks(
        request: Request,
        limit: int = Query(default=100, ge=1, le=500),
    ) -> list[BrowserTask]:
        _require_management(request, management_access)
        return await tasks.list_recent(limit)

    @router.get("/extensions", response_model=list[BrowserExtensionStatus])
    async def list_extensions(request: Request) -> list[BrowserExtensionStatus]:
        _require_management(request, management_access)
        now = datetime.now(UTC)
        return [
            BrowserExtensionStatus(
                extension_id=item.extension_id,
                registered_at=item.registered_at,
                last_seen_at=item.last_seen_at,
                online=now - item.last_seen_at <= _ONLINE_GRACE,
            )
            for item in await credentials.list_presence()
        ]

    @router.get("/tasks/{task_id}", response_model=BrowserTask)
    async def get_task(task_id: str, request: Request) -> BrowserTask:
        _require_management(request, management_access)
        return await tasks.require(task_id)

    @router.post("/tasks/{task_id}/retry", response_model=BrowserTask)
    async def retry_task(task_id: str, request: Request) -> BrowserTask:
        _require_management(request, management_access)
        return await tasks.retry(task_id)

    @router.post(
        "/extension/register",
        response_model=BrowserExtensionTokenResponse,
    )
    async def register_extension(
        payload: BrowserExtensionRegisterRequest,
        request: Request,
    ) -> BrowserExtensionTokenResponse:
        _require_extension_origin(request, payload.extension_id)
        token = await credentials.register(payload.extension_id)
        return BrowserExtensionTokenResponse(
            extension_id=payload.extension_id,
            token=token,
        )

    @router.post(
        "/extension/tasks/claim",
        response_model=BrowserTaskClaim | None,
    )
    async def claim_task(
        request: Request,
        wait_seconds: float = Query(default=0, ge=0, le=30),
    ) -> BrowserTaskClaim | None:
        extension_id = await _require_extension(request, credentials)
        return await tasks.wait_for_claim(
            lambda: execution.claim(extension_id, BrowserDriver.EXTENSION),
            wait_seconds,
        )

    @router.post(
        "/extension/account-challenges/claim",
        response_model=BrowserAccountChallengeClaimResponse | None,
    )
    async def claim_account_challenge(
        request: Request,
        wait_seconds: float = Query(default=0, ge=0, le=30),
    ) -> BrowserAccountChallengeClaimResponse | None:
        extension_id = await _require_extension(request, credentials)
        claim = await account_challenges.claim(extension_id, wait_seconds)
        if claim is None:
            return None
        return BrowserAccountChallengeClaimResponse(
            challenge_id=claim.challenge_id,
            challenge_key=urlsafe_b64encode(claim.challenge_key)
            .decode("ascii")
            .rstrip("="),
            expires_at=claim.expires_at,
            lease_token=claim.lease_token,
        )

    @router.post(
        "/extension/account-challenges/{challenge_id}/answer",
        status_code=204,
    )
    async def answer_account_challenge(
        challenge_id: str,
        payload: BrowserAccountChallengeAnswerRequest,
        request: Request,
    ) -> Response:
        extension_id = await _require_extension(request, credentials)
        proof = _account_proof(payload)
        accepted = await account_challenges.answer(
            challenge_id,
            extension_id,
            _account_challenge_lease(request),
            proof,
        )
        if not accepted:
            raise HTTPException(status_code=409, detail="账号挑战已经失效")
        return Response(status_code=204)

    @router.post(
        "/extension/tasks/{task_id}/status",
        response_model=BrowserTask,
    )
    async def update_task_status(
        task_id: str,
        payload: BrowserTaskStatusRequest,
        request: Request,
    ) -> BrowserTask:
        await _require_extension(request, credentials)
        return await execution.update(
            task_id,
            _lease_token(request),
            payload.status,
            payload.message,
        )

    @router.post(
        "/extension/tasks/{task_id}/result",
        response_model=BrowserTask,
    )
    async def complete_task(
        task_id: str,
        payload: BrowserTaskResultRequest,
        request: Request,
    ) -> BrowserTask:
        await _require_extension(request, credentials)
        return await execution.update(
            task_id,
            _lease_token(request),
            payload.status,
            payload.message,
            payload.result,
        )

    return router


def _require_management(
    request: Request,
    access_policy: SettingsAccessPolicy,
) -> None:
    if not access_policy(request):
        raise HTTPException(status_code=403, detail="浏览器任务仅允许从本机管理")


def _require_extension_origin(request: Request, extension_id: str) -> None:
    if not request.client or not _is_loopback(request.client.host):
        raise HTTPException(status_code=403, detail="扩展登记仅允许连接本机服务")
    origin = urlsplit(request.headers.get("origin", ""))
    if origin.scheme not in _EXTENSION_SCHEMES or origin.netloc != extension_id:
        raise HTTPException(status_code=403, detail="扩展来源与标识不匹配")


async def _require_extension(
    request: Request,
    credentials: ExtensionCredentialService,
) -> str:
    extension_id = request.headers.get("x-extension-id", "")
    scheme, _, token = request.headers.get("authorization", "").partition(" ")
    if (
        not extension_id
        or scheme.casefold() != "bearer"
        or not token
        or not await credentials.validate(extension_id, token)
    ):
        raise HTTPException(status_code=401, detail="扩展能力令牌无效")
    return extension_id


def _lease_token(request: Request) -> str:
    token = request.headers.get("x-browser-lease", "")
    if not token:
        raise HTTPException(status_code=401, detail="缺少浏览器任务租约")
    return token


def _account_challenge_lease(request: Request) -> str:
    token = request.headers.get("x-account-challenge-lease", "")
    if not token:
        raise HTTPException(status_code=401, detail="缺少账号挑战租约")
    return token


def _account_proof(payload: BrowserAccountChallengeAnswerRequest) -> AccountProof:
    if payload.status == "logged_out":
        return AccountProof.logged_out()
    if payload.status != "proved" or payload.proof is None:
        return AccountProof.unverified()
    return AccountProof.proved(bytes.fromhex(payload.proof))


def _is_loopback(host: str) -> bool:
    if host.casefold() == "localhost":
        return True
    try:
        return ip_address(host).is_loopback
    except ValueError:
        return False
