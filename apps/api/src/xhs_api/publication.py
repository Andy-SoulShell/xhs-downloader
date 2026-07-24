"""本机管理端与浏览器扩展协作的内容发布 API。"""

from collections.abc import AsyncIterator
from ipaddress import ip_address
from typing import Annotated
from urllib.parse import urlsplit

from fastapi import APIRouter, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse
from xhs_core.application import (
    ExtensionCredentialService,
    PublicationDraftService,
    PublicationExecutionService,
    PublicationTaskService,
)
from xhs_core.domain import PublicationClaim, PublicationDraft, PublicationTask

from .publication_models import (
    DraftCreateRequest,
    DraftUpdateRequest,
    ExtensionRegisterRequest,
    ExtensionTokenResponse,
    PublicationClaimRequest,
    PublicationEventRequest,
    TaskSubmitRequest,
)
from .settings import SettingsAccessPolicy

_EXTENSION_SCHEMES = {
    "chrome-extension",
    "moz-extension",
    "safari-web-extension",
}


def create_publication_router(
    drafts: PublicationDraftService,
    tasks: PublicationTaskService,
    execution: PublicationExecutionService,
    credentials: ExtensionCredentialService,
    management_access: SettingsAccessPolicy,
) -> APIRouter:
    """创建内容发布路由。

    Args:
        drafts: 草稿与素材管理用例。
        tasks: 任务提交与管理用例。
        execution: 扩展领取与执行用例。
        credentials: 扩展能力凭据用例。
        management_access: 本机管理端访问判定策略。

    Returns:
        可挂载到主应用的发布路由。
    """
    router = APIRouter(prefix="/publication", tags=["内容发布"])

    @router.get("/drafts", response_model=list[PublicationDraft])
    async def list_drafts(
        request: Request,
        limit: int = Query(default=100, ge=1, le=500),
    ) -> list[PublicationDraft]:
        _require_management(request, management_access)
        return await drafts.list_recent(limit)

    @router.post(
        "/drafts",
        response_model=PublicationDraft,
        status_code=201,
    )
    async def create_draft(
        payload: DraftCreateRequest,
        request: Request,
    ) -> PublicationDraft:
        _require_management(request, management_access)
        return await drafts.create(payload.title, payload.body, payload.tags)

    @router.get("/drafts/{draft_id}", response_model=PublicationDraft)
    async def get_draft(draft_id: str, request: Request) -> PublicationDraft:
        _require_management(request, management_access)
        return await drafts.require(draft_id)

    @router.put("/drafts/{draft_id}", response_model=PublicationDraft)
    async def update_draft(
        draft_id: str,
        payload: DraftUpdateRequest,
        request: Request,
    ) -> PublicationDraft:
        _require_management(request, management_access)
        return await drafts.update(
            draft_id,
            payload.title,
            payload.body,
            payload.tags,
            payload.asset_order,
        )

    @router.delete("/drafts/{draft_id}", status_code=204)
    async def delete_draft(draft_id: str, request: Request) -> None:
        _require_management(request, management_access)
        await drafts.delete(draft_id)

    @router.post(
        "/drafts/{draft_id}/assets",
        response_model=PublicationDraft,
    )
    async def add_asset(
        draft_id: str,
        request: Request,
        upload: Annotated[UploadFile, File()],
    ) -> PublicationDraft:
        _require_management(request, management_access)
        try:
            return await drafts.add_asset(
                draft_id,
                upload.filename or "media",
                upload.content_type or "application/octet-stream",
                _upload_chunks(upload),
            )
        finally:
            await upload.close()

    @router.delete(
        "/drafts/{draft_id}/assets/{asset_id}",
        response_model=PublicationDraft,
    )
    async def remove_asset(
        draft_id: str,
        asset_id: str,
        request: Request,
    ) -> PublicationDraft:
        _require_management(request, management_access)
        return await drafts.remove_asset(draft_id, asset_id)

    @router.post(
        "/drafts/{draft_id}/submit",
        response_model=PublicationTask,
        status_code=202,
    )
    async def submit_task(
        draft_id: str,
        payload: TaskSubmitRequest,
        request: Request,
    ) -> PublicationTask:
        _require_management(request, management_access)
        draft = await drafts.require(draft_id)
        return await tasks.submit(draft, payload.mode, payload.scheduled_at)

    @router.get("/tasks", response_model=list[PublicationTask])
    async def list_tasks(
        request: Request,
        limit: int = Query(default=100, ge=1, le=500),
    ) -> list[PublicationTask]:
        _require_management(request, management_access)
        return await tasks.list_recent(limit)

    @router.get("/tasks/{task_id}", response_model=PublicationTask)
    async def get_task(task_id: str, request: Request) -> PublicationTask:
        _require_management(request, management_access)
        return await tasks.require(task_id)

    @router.post("/tasks/{task_id}/retry", response_model=PublicationTask)
    async def retry_task(task_id: str, request: Request) -> PublicationTask:
        _require_management(request, management_access)
        return await tasks.retry(task_id)

    @router.post("/tasks/{task_id}/cancel", response_model=PublicationTask)
    async def cancel_task(task_id: str, request: Request) -> PublicationTask:
        _require_management(request, management_access)
        return await tasks.cancel(task_id)

    @router.post(
        "/extension/register",
        response_model=ExtensionTokenResponse,
    )
    async def register_extension(
        payload: ExtensionRegisterRequest,
        request: Request,
    ) -> ExtensionTokenResponse:
        _require_extension_origin(request, payload.extension_id)
        token = await credentials.register(payload.extension_id)
        return ExtensionTokenResponse(
            extension_id=payload.extension_id,
            token=token,
        )

    @router.post(
        "/extension/claim",
        response_model=PublicationClaim | None,
    )
    async def claim_task(
        payload: PublicationClaimRequest,
        request: Request,
    ) -> PublicationClaim | None:
        extension_id = await _require_extension(request, credentials)
        return await execution.claim(extension_id, payload.preferred_task_id)

    @router.post(
        "/tasks/{task_id}/events",
        response_model=PublicationTask,
    )
    async def update_task(
        task_id: str,
        payload: PublicationEventRequest,
        request: Request,
    ) -> PublicationTask:
        await _require_extension(request, credentials)
        return await execution.update_status(
            task_id,
            _lease_token(request),
            payload.status,
            payload.message,
            payload.result_url,
        )

    @router.get("/tasks/{task_id}/assets/{asset_id}")
    async def get_asset(
        task_id: str,
        asset_id: str,
        request: Request,
    ) -> FileResponse:
        await _require_extension(request, credentials)
        path = await execution.asset_path(
            task_id,
            _lease_token(request),
            asset_id,
        )
        return FileResponse(path)

    return router


async def _upload_chunks(upload: UploadFile) -> AsyncIterator[bytes]:
    while chunk := await upload.read(1024 * 1024):
        yield chunk


def _require_management(
    request: Request,
    access_policy: SettingsAccessPolicy,
) -> None:
    if not access_policy(request):
        raise HTTPException(status_code=403, detail="发布管理仅允许从本机访问")


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
    authorization = request.headers.get("authorization", "")
    scheme, _, token = authorization.partition(" ")
    if (
        not extension_id
        or scheme.casefold() != "bearer"
        or not token
        or not await credentials.validate(extension_id, token)
    ):
        raise HTTPException(status_code=401, detail="扩展能力令牌无效")
    return extension_id


def _lease_token(request: Request) -> str:
    token = request.headers.get("x-publish-lease", "")
    if not token:
        raise HTTPException(status_code=401, detail="缺少发布任务租约")
    return token


def _is_loopback(host: str) -> bool:
    if host.casefold() == "localhost":
        return True
    try:
        return ip_address(host).is_loopback
    except ValueError:
        return False
