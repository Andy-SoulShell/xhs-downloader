"""发布任务提交与管理用例。"""

import asyncio
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from xhs_core.domain import (
    BrowserDriver,
    PublicationDraft,
    PublicationError,
    PublicationMode,
    PublicationTask,
    PublicationTaskStatus,
)
from xhs_core.domain.publication_ports import PublicationTaskRepository

from .publication_scheduler import PublicationScheduler
from .publication_validation import validate_publication_package

_RETRYABLE = {PublicationTaskStatus.FAILED}
_PLATFORM_SCHEDULE_MIN = timedelta(hours=1)
_PLATFORM_SCHEDULE_MAX = timedelta(days=14)


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
        target_driver: BrowserDriver = BrowserDriver.EXTENSION,
    ) -> PublicationTask:
        """把草稿冻结为发布任务。

        Args:
            draft: 待发布草稿。
            mode: 手动立即发布或自动定时发布。
            scheduled_at: 自动模式的计划时间。
            target_driver: 提交时冻结的浏览器执行驱动。

        Returns:
            新建或内容相同的活跃任务。

        Raises:
            PublicationError: 草稿内容、素材或计划时间无效。
        """
        validate_publication_package(draft, target_driver)
        now = datetime.now(UTC)
        schedule = _as_utc(scheduled_at) if scheduled_at else now
        if mode is not PublicationMode.MANUAL and schedule <= now:
            raise PublicationError("自动发布时间必须晚于当前时间")
        if mode is PublicationMode.PLATFORM_SCHEDULED:
            if schedule < now + _PLATFORM_SCHEDULE_MIN:
                raise PublicationError("官方定时发布时间必须至少在 1 小时后")
            if schedule > now + _PLATFORM_SCHEDULE_MAX:
                raise PublicationError("官方定时发布时间不能超过 14 天")
        fingerprint = draft.fingerprint()
        async with self._lock:
            await self._scheduler.reconcile()
            for task in await self._repository.list_active_tasks():
                if (
                    task.package_fingerprint == fingerprint
                    and task.mode is mode
                    and task.target_driver is target_driver
                    and (
                        mode is PublicationMode.MANUAL or task.scheduled_at == schedule
                    )
                ):
                    return task
            status = (
                PublicationTaskStatus.SCHEDULED
                if mode is PublicationMode.SCHEDULED
                else PublicationTaskStatus.READY
            )
            task = PublicationTask(
                task_id=uuid4().hex,
                package=draft.model_copy(deep=True),
                package_fingerprint=fingerprint,
                mode=mode,
                target_driver=target_driver,
                status=status,
                scheduled_at=schedule,
                message=(
                    _ready_message(target_driver, "立即发布")
                    if mode is PublicationMode.MANUAL
                    else (
                        "等待本地计划发布时间"
                        if mode is PublicationMode.SCHEDULED
                        else _ready_message(target_driver, "设置官方定时发布")
                    )
                ),
                created_at=now,
                updated_at=now,
            )
            await self._repository.save_task(task)
            return task

    async def retry(self, task_id: str) -> PublicationTask:
        """重新排队已经明确失败的任务。

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
                if task.status is PublicationTaskStatus.NEEDS_REVIEW:
                    raise PublicationError("结果不确定的发布任务必须先人工核对")
                raise PublicationError("只有明确失败的发布任务可以重试")
            if (
                task.mode is PublicationMode.PLATFORM_SCHEDULED
                and task.scheduled_at < datetime.now(UTC) + _PLATFORM_SCHEDULE_MIN
            ):
                raise PublicationError("官方定时时间已失效，请重新提交发布任务")
            updated = task.model_copy(
                update={
                    "status": PublicationTaskStatus.READY,
                    "executor_id": None,
                    "extension_id": None,
                    "lease_expires_at": None,
                    "message": _ready_message(task.target_driver, "重试发布"),
                    "result_url": None,
                    "publish_attempted": False,
                    "updated_at": datetime.now(UTC),
                }
            )
            if not await self._repository.save_task_if_status(
                updated,
                task.status,
                clear_lease=True,
            ):
                raise PublicationError("发布任务状态已经变化，请刷新后重试")
            return updated

    async def review(
        self,
        task_id: str,
        published: bool,
        result_url: str | None = None,
    ) -> PublicationTask:
        """记录人工核对结果，解除不确定任务的重试禁令。

        Args:
            task_id: 需要人工核对的任务标识。
            published: 已在创作平台确认发布成功时为真。
            result_url: 可选的已发布作品地址。

        Returns:
            转为已发布或明确失败的任务。

        Raises:
            PublicationError: 任务不是待核对状态或状态已经变化。
        """
        async with self._lock:
            task = await self.require(task_id)
            if task.status is not PublicationTaskStatus.NEEDS_REVIEW:
                raise PublicationError("只有待人工核对的发布任务可以确认结果")
            updated = task.model_copy(
                update={
                    "status": (
                        PublicationTaskStatus.PUBLISHED
                        if published
                        else PublicationTaskStatus.FAILED
                    ),
                    "message": (
                        "已人工确认作品发布成功"
                        if published
                        else "已人工确认作品未发布，可以显式重试"
                    ),
                    "result_url": result_url if published else None,
                    "executor_id": None,
                    "extension_id": None,
                    "lease_expires_at": None,
                    "updated_at": datetime.now(UTC),
                }
            )
            if not await self._repository.save_task_if_status(
                updated,
                PublicationTaskStatus.NEEDS_REVIEW,
                clear_lease=True,
            ):
                raise PublicationError("发布任务状态已经变化，请刷新后重试")
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


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        raise PublicationError("计划发布时间必须包含时区")
    return value.astimezone(UTC)


def _ready_message(driver: BrowserDriver, action: str) -> str:
    actor = "扩展" if driver is BrowserDriver.EXTENSION else "受管浏览器"
    return f"等待{actor}{action}"
