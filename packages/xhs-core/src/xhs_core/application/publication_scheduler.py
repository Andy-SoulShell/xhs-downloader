"""发布排期与异常租约恢复。"""

import asyncio
from datetime import UTC, datetime

from loguru import logger

from xhs_core.domain import PublicationTask, PublicationTaskStatus
from xhs_core.domain.publication_ports import PublicationTaskRepository


class PublicationScheduler:
    """把到期任务置为就绪，并安全恢复中断任务。

    Args:
        repository: 发布任务仓储。
        interval: 状态巡检间隔秒数。
    """

    def __init__(
        self,
        repository: PublicationTaskRepository,
        interval: float = 5,
    ) -> None:
        self._repository = repository
        self._interval = interval
        self._lock = asyncio.Lock()
        self._watcher: asyncio.Task[None] | None = None

    async def start(self) -> None:
        """恢复服务中断任务并启动排期巡检。"""
        if self._watcher:
            return
        await self.reconcile(recover_all=True)
        self._watcher = asyncio.create_task(self._watch())

    async def close(self) -> None:
        """停止排期巡检，持久化任务保持原状。"""
        if not self._watcher:
            return
        self._watcher.cancel()
        await asyncio.gather(self._watcher, return_exceptions=True)
        self._watcher = None

    async def reconcile(self, recover_all: bool = False) -> None:
        """刷新到期排期并处理失效租约。

        Args:
            recover_all: 是否把服务重启视为所有执行租约失效。
        """
        async with self._lock:
            now = datetime.now(UTC)
            for task in await self._repository.list_active_tasks():
                await self._reconcile_task(task, now, recover_all)

    async def _watch(self) -> None:
        while True:
            await asyncio.sleep(self._interval)
            try:
                await self.reconcile()
            except Exception:
                logger.exception("发布任务巡检失败，稍后自动重试")

    async def _reconcile_task(
        self,
        task: PublicationTask,
        now: datetime,
        recover_all: bool,
    ) -> None:
        expired = task.lease_expires_at is not None and task.lease_expires_at <= now
        if task.status is PublicationTaskStatus.SCHEDULED and task.scheduled_at <= now:
            await self._save_ready(task, "已到计划时间，等待扩展")
            return
        if task.status in {
            PublicationTaskStatus.CLAIMED,
            PublicationTaskStatus.FILLING,
        } and (recover_all or expired):
            await self._save_ready(task, "扩展中断，任务重新就绪")
            return
        if task.status is PublicationTaskStatus.PUBLISHING and (recover_all or expired):
            updated = task.model_copy(
                update={
                    "status": PublicationTaskStatus.NEEDS_REVIEW,
                    "message": "发布结果未能确认，请人工检查",
                    "lease_expires_at": None,
                    "updated_at": now,
                }
            )
            if await self._repository.save_task_if_status(updated, task.status):
                await self._repository.clear_lease(task.task_id)

    async def _save_ready(
        self,
        task: PublicationTask,
        message: str,
    ) -> None:
        ready = task.model_copy(
            update={
                "status": PublicationTaskStatus.READY,
                "extension_id": None,
                "lease_expires_at": None,
                "message": message,
                "updated_at": datetime.now(UTC),
            }
        )
        if await self._repository.save_task_if_status(ready, task.status):
            await self._repository.clear_lease(task.task_id)
