"""本机管理端与浏览器扩展协作的内容发布 API。"""

from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import APIRouter, File, Query, Request, UploadFile
from fastapi.responses import FileResponse
from xhs_core.application import (
    ExtensionCredentialService,
    PublicationDraftService,
    PublicationExecutionService,
    PublicationTaskService,
)
from xhs_core.domain import PublicationClaim, PublicationDraft, PublicationTask

from .publication_access import (
    require_extension as _require_extension,
)
from .publication_access import (
    require_extension_origin as _require_extension_origin,
)
from .publication_access import (
    require_lease_token as _lease_token,
)
from .publication_access import (
    require_management as _require_management,
)
from .publication_models import (
    DraftCreateRequest,
    DraftUpdateRequest,
    ExtensionRegisterRequest,
    ExtensionTokenResponse,
    PublicationClaimRequest,
    PublicationEventRequest,
    TaskReviewRequest,
    TaskSubmitRequest,
)
from .settings import SettingsAccessPolicy


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
        return await drafts.create(
            payload.title,
            payload.body,
            payload.tags,
            payload.visibility,
            payload.is_original,
            payload.products,
        )

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
            payload.visibility,
            payload.is_original,
            payload.products,
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

    @router.post("/tasks/{task_id}/review", response_model=PublicationTask)
    async def review_task(
        task_id: str,
        payload: TaskReviewRequest,
        request: Request,
    ) -> PublicationTask:
        _require_management(request, management_access)
        return await tasks.review(
            task_id,
            payload.decision == "published",
            payload.result_url,
        )

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
