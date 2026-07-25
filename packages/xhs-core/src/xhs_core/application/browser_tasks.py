"""通用浏览器任务提交与管理用例。"""

from asyncio import Lock, get_running_loop, sleep
from datetime import UTC, datetime
from uuid import uuid4

from pydantic import JsonValue

from xhs_core.domain import (
    BrowserTask,
    BrowserTaskError,
    BrowserTaskKind,
    BrowserTaskStatus,
    can_retry_browser_task,
)
from xhs_core.domain.browser_ports import BrowserTaskRepository
from xhs_core.domain.browser_requests import validate_browser_task_payload


class BrowserTaskService:
    """管理浏览器任务的幂等提交、查询与显式重试。

    Args:
        repository: 浏览器任务仓储。
    """

    def __init__(self, repository: BrowserTaskRepository) -> None:
        self._repository = repository
        self._submit_lock = Lock()

    async def submit(
        self,
        kind: BrowserTaskKind,
        payload: dict[str, JsonValue],
        request_id: str | None = None,
    ) -> BrowserTask:
        """提交冻结输入的浏览器任务。

        Args:
            kind: 浏览器操作类型。
            payload: 通过 JSON 类型边界验证的任务输入。
            request_id: 可选的调用方幂等标识。

        Returns:
            新任务或同一幂等请求已经创建的任务。

        Raises:
            BrowserTaskError: 幂等标识被不同请求复用。
        """
        normalized_payload = validate_browser_task_payload(kind, payload)
        async with self._submit_lock:
            if request_id:
                existing = await self._repository.get_by_request_id(request_id)
                if existing:
                    if (
                        existing.kind is not kind
                        or existing.payload != normalized_payload
                    ):
                        raise BrowserTaskError("请求标识已被另一项浏览器任务使用")
                    return existing
            now = datetime.now(UTC)
            task = BrowserTask(
                task_id=uuid4().hex,
                request_id=request_id,
                kind=kind,
                payload=normalized_payload,
                created_at=now,
                updated_at=now,
            )
            await self._repository.save(task)
            return task

    async def require(self, task_id: str) -> BrowserTask:
        """读取任务，不存在时抛出领域错误。

        Args:
            task_id: 任务唯一标识。

        Returns:
            已存在任务。

        Raises:
            BrowserTaskError: 任务不存在。
        """
        task = await self._repository.get(task_id)
        if not task:
            raise BrowserTaskError("浏览器任务不存在")
        return task

    async def list_recent(self, limit: int) -> list[BrowserTask]:
        """列出最近浏览器任务。

        Args:
            limit: 最大返回数量。

        Returns:
            按更新时间倒序排列的任务。
        """
        return await self._repository.list_recent(limit)

    async def wait(
        self,
        task_id: str,
        timeout_seconds: float,
        poll_interval: float = 0.2,
    ) -> BrowserTask:
        """等待浏览器任务进入终态，超时则返回最新快照。

        Args:
            task_id: 任务唯一标识。
            timeout_seconds: 最长等待秒数。
            poll_interval: 仓储轮询间隔秒数。

        Returns:
            终态任务，或等待超时时的最新任务快照。

        Raises:
            BrowserTaskError: 任务不存在或等待参数无效。
        """
        if timeout_seconds < 0 or poll_interval <= 0:
            raise BrowserTaskError("浏览器任务等待参数无效")
        deadline = get_running_loop().time() + timeout_seconds
        while True:
            task = await self.require(task_id)
            if task.status in {
                BrowserTaskStatus.SUCCEEDED,
                BrowserTaskStatus.FAILED,
                BrowserTaskStatus.NEEDS_REVIEW,
            }:
                return task
            remaining = deadline - get_running_loop().time()
            if remaining <= 0:
                return task
            await sleep(min(poll_interval, remaining))

    async def retry(self, task_id: str) -> BrowserTask:
        """重新排队一个明确失败的任务。

        Args:
            task_id: 任务唯一标识。

        Returns:
            已重新排队的任务。

        Raises:
            BrowserTaskError: 任务不存在、结果不确定或状态不允许重试。
        """
        task = await self.require(task_id)
        if not can_retry_browser_task(task):
            if task.status is BrowserTaskStatus.NEEDS_REVIEW:
                raise BrowserTaskError("结果不确定的任务必须人工核对，不能直接重试")
            raise BrowserTaskError("只有明确失败的浏览器任务可以重试")
        queued = task.model_copy(
            update={
                "status": BrowserTaskStatus.QUEUED,
                "result": None,
                "extension_id": None,
                "lease_expires_at": None,
                "message": "等待浏览器扩展重试",
                "updated_at": datetime.now(UTC),
            }
        )
        if not await self._repository.save_if_status(
            queued,
            BrowserTaskStatus.FAILED,
        ):
            raise BrowserTaskError("浏览器任务状态已经变化，请刷新后重试")
        await self._repository.clear_lease(task_id)
        return queued
