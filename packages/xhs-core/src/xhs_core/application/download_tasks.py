"""可持久化后台下载任务协调器。"""

import re
from asyncio import Lock, Semaphore, Task, create_task, gather
from datetime import UTC, datetime
from uuid import uuid4

from loguru import logger

from xhs_core.domain.errors import TaskStateError
from xhs_core.domain.models import DownloadTask, DownloadTaskStatus
from xhs_core.domain.ports import TaskRepository

from .download import DownloadService

SENSITIVE_QUERY = re.compile(r"(https?://[^?\s]+)\?\S+")


class DownloadTaskCoordinator:
    """协调任务持久化、并发执行、恢复和显式重试。

    Args:
        service: 复用完整缓存、校验和下载能力的应用服务。
        repository: 持久化任务快照的仓储。
        max_concurrency: 同时执行的最大作品任务数。
    """

    def __init__(
        self,
        service: DownloadService,
        repository: TaskRepository,
        max_concurrency: int,
    ) -> None:
        self._service = service
        self._repository = repository
        self._semaphore = Semaphore(max_concurrency)
        self._submit_lock = Lock()
        self._workers: dict[str, Task[None]] = {}

    async def start(self) -> None:
        """恢复上次退出时尚未结束的任务。"""
        for task in await self._repository.list_recoverable():
            recovered = task.model_copy(
                update={
                    "status": DownloadTaskStatus.QUEUED,
                    "message": "服务恢复后重新排队",
                    "updated_at": datetime.now(UTC),
                }
            )
            await self._repository.save(recovered)
            self._schedule(recovered.task_id)

    async def close(self) -> None:
        """停止当前进程中的任务，保留持久化状态供下次恢复。"""
        workers = list(self._workers.values())
        for worker in workers:
            worker.cancel()
        if workers:
            await gather(*workers, return_exceptions=True)
        self._workers.clear()

    async def submit(
        self,
        source_url: str,
        media_indexes: list[int],
        force: bool,
        client_request_id: str | None = None,
    ) -> DownloadTask:
        """提交任务，并按客户端请求标识保持幂等。

        Args:
            source_url: 作品链接。
            media_indexes: 需要下载的一基媒体序号。
            force: 是否强制重新下载。
            client_request_id: 可选客户端幂等标识。

        Returns:
            新建或已存在的任务。
        """
        async with self._submit_lock:
            if client_request_id:
                existing = await self._repository.get_by_request_id(client_request_id)
                if existing:
                    return existing
            now = datetime.now(UTC)
            task = DownloadTask(
                task_id=uuid4().hex,
                client_request_id=client_request_id,
                source_url=source_url,
                media_indexes=sorted(set(media_indexes)),
                force=force,
                created_at=now,
                updated_at=now,
            )
            await self._repository.save(task)
            self._schedule(task.task_id)
            return task

    async def get(self, task_id: str) -> DownloadTask | None:
        """读取一个任务。

        Args:
            task_id: 任务唯一标识。

        Returns:
            已有任务；不存在时返回 ``None``。
        """
        return await self._repository.get(task_id)

    async def list_recent(
        self,
        limit: int,
        status: DownloadTaskStatus | None = None,
    ) -> list[DownloadTask]:
        """读取最近任务。

        Args:
            limit: 最大返回数量。
            status: 可选状态筛选。

        Returns:
            按更新时间倒序排列的任务。
        """
        return await self._repository.list_recent(limit, status)

    async def retry(self, task_id: str) -> DownloadTask | None:
        """重新排队一个失败任务。

        Args:
            task_id: 任务唯一标识。

        Returns:
            重新排队的任务；不存在时返回 ``None``。

        Raises:
            TaskStateError: 任务尚未失败。
        """
        async with self._submit_lock:
            task = await self._repository.get(task_id)
            if not task:
                return None
            if task.status is not DownloadTaskStatus.FAILED:
                raise TaskStateError("只有失败任务可以重新排队")
            queued = task.model_copy(
                update={
                    "status": DownloadTaskStatus.QUEUED,
                    "message": "等待后台重试",
                    "detail": None,
                    "artifacts": [],
                    "updated_at": datetime.now(UTC),
                }
            )
            await self._repository.save(queued)
            self._schedule(task_id)
            return queued

    def _schedule(self, task_id: str) -> None:
        worker = self._workers.get(task_id)
        if worker and not worker.done():
            return
        self._workers[task_id] = create_task(self._run(task_id))

    async def _run(self, task_id: str) -> None:
        try:
            async with self._semaphore:
                task = await self._repository.get(task_id)
                if not task or task.status is not DownloadTaskStatus.QUEUED:
                    return
                running = task.model_copy(
                    update={
                        "status": DownloadTaskStatus.RUNNING,
                        "attempts": task.attempts + 1,
                        "message": "后台正在下载",
                        "updated_at": datetime.now(UTC),
                    }
                )
                await self._repository.save(running)
                await self._execute(running)
        finally:
            self._workers.pop(task_id, None)

    async def _execute(self, task: DownloadTask) -> None:
        try:
            outcome = await self._service.download(
                task.source_url,
                set(task.media_indexes),
                task.force,
                None,
            )
        except Exception as error:
            message = _safe_error_message(error)
            logger.error("后台任务 {} 执行失败：{}", task.task_id, message)
            completed = task.model_copy(
                update={
                    "status": DownloadTaskStatus.FAILED,
                    "message": message,
                    "updated_at": datetime.now(UTC),
                }
            )
        else:
            completed = task.model_copy(
                update={
                    "status": DownloadTaskStatus.COMPLETED,
                    "message": outcome.message,
                    "detail": outcome.detail,
                    "artifacts": outcome.artifacts,
                    "updated_at": datetime.now(UTC),
                }
            )
        await self._repository.save(completed)


def _safe_error_message(error: Exception) -> str:
    message = str(error) or type(error).__name__
    return SENSITIVE_QUERY.sub(r"\1?<redacted>", message)[:1000]
