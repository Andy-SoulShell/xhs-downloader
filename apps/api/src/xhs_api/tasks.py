"""后台下载任务 HTTP 接口。"""

from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Request
from xhs_core.application import DownloadTaskCoordinator
from xhs_core.domain import DownloadTask, DownloadTaskStatus

from .models import TaskRequest


def create_task_router() -> APIRouter:
    """创建后台下载任务路由。

    Returns:
        可挂载到主应用的路由。
    """
    router = APIRouter(prefix="/tasks", tags=["下载任务"])

    @router.post("", response_model=DownloadTask, status_code=202)
    async def submit_task(payload: TaskRequest, request: Request) -> DownloadTask:
        tasks: DownloadTaskCoordinator = request.app.state.tasks
        return await tasks.submit(
            payload.url,
            payload.index,
            payload.force,
            payload.request_id,
        )

    @router.get("", response_model=list[DownloadTask])
    async def list_tasks(
        request: Request,
        limit: int = Query(default=100, ge=1, le=500),
        status: Annotated[DownloadTaskStatus | None, Query()] = None,
    ) -> list[DownloadTask]:
        tasks: DownloadTaskCoordinator = request.app.state.tasks
        return await tasks.list_recent(limit, status)

    @router.get("/{task_id}", response_model=DownloadTask)
    async def get_task(task_id: str, request: Request) -> DownloadTask:
        tasks: DownloadTaskCoordinator = request.app.state.tasks
        task = await tasks.get(task_id)
        if not task:
            raise HTTPException(status_code=404, detail="下载任务不存在")
        return task

    @router.post("/{task_id}/retry", response_model=DownloadTask, status_code=202)
    async def retry_task(task_id: str, request: Request) -> DownloadTask:
        tasks: DownloadTaskCoordinator = request.app.state.tasks
        task = await tasks.retry(task_id)
        if not task:
            raise HTTPException(status_code=404, detail="下载任务不存在")
        return task

    return router
