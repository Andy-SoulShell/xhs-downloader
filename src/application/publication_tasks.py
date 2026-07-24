"""发布任务提交与管理用例。"""

import asyncio
from datetime import UTC, datetime
from uuid import uuid4

from src.domain import (
    PublicationDraft,
    PublicationError,
    PublicationMode,
    PublicationTask,
    PublicationTaskStatus,
)
from src.domain.publication_ports import PublicationTaskRepository

from .publication_scheduler import PublicationScheduler

_RETRYABLE = {
    PublicationTaskStatus.FAILED,
    PublicationTaskStatus.NEEDS_REVIEW,
}


class PublicationTaskService:
    """创建、查询、重试和取消发布任务。

    Args:
        repository: 发布任务仓储。
        scheduler: 排期与异常租约恢复服务。
    """

    def __init__(
        self,
        repository: PublicationTaskRepository,
        scheduler: PublicationScheduler,
    ) -> None:
        self._repository = repository
        self._scheduler = scheduler
        self._lock = asyncio.Lock()

    async def submit(
        self,
        draft: PublicationDraft,
        mode: PublicationMode,
        scheduled_at: datetime | None,
    ) -> PublicationTask:
        """把草稿冻结为发布任务。

        Args:
            draft: 待发布草稿。
            mode: 手动立即发布或自动定时发布。
            scheduled_at: 自动模式的计划时间。

        Returns:
            新建或内容相同的活跃任务。

        Raises:
            PublicationError: 草稿内容、素材或计划时间无效。
        """
        _validate_package(draft)
        now = datetime.now(UTC)
        schedule = _as_utc(scheduled_at) if scheduled_at else now
        if mode is PublicationMode.SCHEDULED and schedule <= now:
            raise PublicationError("自动发布时间必须晚于当前时间")
        fingerprint = draft.fingerprint()
        async with self._lock:
            await self._scheduler.reconcile()
            for task in await self._repository.list_active_tasks():
                if (
                    task.package_fingerprint == fingerprint
                    and task.mode is mode
                    and (
                        mode is PublicationMode.MANUAL or task.scheduled_at == schedule
                    )
                ):
                    return task
            status = (
                PublicationTaskStatus.READY
                if mode is PublicationMode.MANUAL
                else PublicationTaskStatus.SCHEDULED
            )
            task = PublicationTask(
                task_id=uuid4().hex,
                package=draft.model_copy(deep=True),
                package_fingerprint=fingerprint,
                mode=mode,
                status=status,
                scheduled_at=schedule,
                message=(
                    "等待扩展立即发布"
                    if mode is PublicationMode.MANUAL
                    else "等待计划发布时间"
                ),
                created_at=now,
                updated_at=now,
            )
            await self._repository.save_task(task)
            return task

    async def retry(self, task_id: str) -> PublicationTask:
        """重新排队需要人工处理或失败的任务。

        Args:
            task_id: 任务唯一标识。

        Returns:
            已重新排队任务。

        Raises:
            PublicationError: 当前状态不能重试。
        """
        async with self._lock:
            task = await self.require(task_id)
            if task.status not in _RETRYABLE:
                raise PublicationError("只有失败或待人工处理的任务可以重试")
            updated = task.model_copy(
                update={
                    "status": PublicationTaskStatus.READY,
                    "extension_id": None,
                    "lease_expires_at": None,
                    "message": "等待扩展重试发布",
                    "result_url": None,
                    "updated_at": datetime.now(UTC),
                }
            )
            if not await self._repository.save_task_if_status(
                updated,
                task.status,
            ):
                raise PublicationError("发布任务状态已经变化，请刷新后重试")
            await self._repository.clear_lease(task_id)
            return updated

    async def cancel(self, task_id: str) -> PublicationTask:
        """取消尚未执行的任务。

        Args:
            task_id: 任务唯一标识。

        Returns:
            已取消任务。

        Raises:
            PublicationError: 任务已经开始执行。
        """
        async with self._lock:
            task = await self.require(task_id)
            if task.status not in {
                PublicationTaskStatus.SCHEDULED,
                PublicationTaskStatus.READY,
            }:
                raise PublicationError("任务已经开始执行，不能取消")
            updated = task.model_copy(
                update={
                    "status": PublicationTaskStatus.CANCELED,
                    "message": "发布任务已取消",
                    "updated_at": datetime.now(UTC),
                }
            )
            if not await self._repository.save_task_if_status(
                updated,
                task.status,
            ):
                raise PublicationError("发布任务状态已经变化，请刷新后重试")
            return updated

    async def require(self, task_id: str) -> PublicationTask:
        """读取任务，不存在时抛出领域错误。

        Args:
            task_id: 任务唯一标识。

        Returns:
            已存在任务。

        Raises:
            PublicationError: 任务不存在。
        """
        task = await self._repository.get_task(task_id)
        if not task:
            raise PublicationError("发布任务不存在")
        return task

    async def list_recent(self, limit: int) -> list[PublicationTask]:
        """列出最近任务并刷新排期状态。

        Args:
            limit: 最大返回数量。

        Returns:
            按更新时间倒序排列的任务。
        """
        await self._scheduler.reconcile()
        return await self._repository.list_tasks(limit)


def _validate_package(draft: PublicationDraft) -> None:
    if not draft.assets:
        raise PublicationError("发布草稿至少需要一个素材")
    if not draft.title and not draft.body:
        raise PublicationError("发布标题和正文不能同时为空")


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        raise PublicationError("计划发布时间必须包含时区")
    return value.astimezone(UTC)
