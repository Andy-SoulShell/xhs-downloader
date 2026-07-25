"""受管浏览器发布的人机协作接口。"""

from fastapi import APIRouter, HTTPException, Request
from xhs_core.application import ManagedPublicationWorker, PublicationTaskService
from xhs_core.domain import BrowserDriver, PublicationTaskStatus

from .publication_access import require_management
from .publication_models import (
    ManagedVerificationResumeRequest,
    ManagedVerificationResumeResponse,
)
from .settings import SettingsAccessPolicy


def create_managed_publication_router(
    tasks: PublicationTaskService,
    worker: ManagedPublicationWorker,
    management_access: SettingsAccessPolicy,
) -> APIRouter:
    """创建仅恢复当前受管发布页面的验证接口。

    Args:
        tasks: 发布任务查询用例。
        worker: 持有当前受管发布页面的 Worker。
        management_access: 本机管理端访问判定策略。

    Returns:
        只接受本机显式确认的发布协作路由。
    """
    router = APIRouter(prefix="/publication", tags=["内容发布"])

    @router.post(
        "/tasks/{task_id}/verification/resume",
        response_model=ManagedVerificationResumeResponse,
        status_code=202,
    )
    async def resume_verification(
        task_id: str,
        payload: ManagedVerificationResumeRequest,
        request: Request,
    ) -> ManagedVerificationResumeResponse:
        require_management(request, management_access)
        task = await tasks.require(task_id)
        if task.target_driver is not BrowserDriver.MANAGED:
            raise HTTPException(
                status_code=409,
                detail="只有受管浏览器发布任务可以继续安全验证",
            )
        if task.status is not PublicationTaskStatus.AWAITING_VERIFICATION:
            raise HTTPException(
                status_code=409,
                detail="发布任务当前未等待安全验证",
            )
        if not payload.confirmed or not await worker.resume(task_id):
            raise HTTPException(
                status_code=409,
                detail="原受管发布页面已失效或验证恢复请求已处理",
            )
        return ManagedVerificationResumeResponse(
            task_id=task.task_id,
            publish_attempted=task.publish_attempted,
            message="已确认安全验证完成，受管发布将在原页面继续",
        )

    return router
