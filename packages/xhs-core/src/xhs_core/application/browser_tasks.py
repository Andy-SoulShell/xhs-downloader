"""通用浏览器任务提交与管理用例。"""

from asyncio import Lock, get_running_loop, sleep
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from uuid import uuid4

from pydantic import JsonValue

from xhs_core.domain import (
    BrowserDriver,
    BrowserTask,
    BrowserTaskError,
    BrowserTaskKind,
    BrowserTaskStatus,
    browser_driver_supports,
)
from xhs_core.domain.browser_ports import BrowserTaskRepository
from xhs_core.domain.browser_requests import validate_browser_task_payload

from .browser_task_claiming import _BrowserTaskClaimWaiter
from .browser_task_resolution import requeue_failed_task, resolve_reviewed_task


class BrowserTaskService:
    """管理浏览器任务的幂等提交、查询与显式重试。

    Args:
        repository: 浏览器任务仓储。
    """

    def __init__(self, repository: BrowserTaskRepository) -> None:
        self._repository = repository
        self._submit_lock = Lock()
        self._claim_waiter = _BrowserTaskClaimWaiter()

    async def submit(
        self,
        kind: BrowserTaskKind,
        payload: dict[str, JsonValue],
        request_id: str | None = None,
        target_driver: BrowserDriver = BrowserDriver.EXTENSION,
    ) -> BrowserTask:
        """提交冻结输入的浏览器任务。

        Args:
            kind: 浏览器操作类型。
            payload: 通过 JSON 类型边界验证的任务输入。
            request_id: 可选的调用方幂等标识。
            target_driver: 提交时冻结的浏览器执行驱动。

        Returns:
            新任务或同一幂等请求已经创建的任务。

        Raises:
            BrowserTaskError: 目标驱动不支持该任务，或幂等标识被不同请求复用。
        """
        if not browser_driver_supports(target_driver, kind):
            raise BrowserTaskError(
                f"当前浏览器执行器尚未支持{kind.value}任务，请改用其他执行器"
            )
        normalized_payload = validate_browser_task_payload(kind, payload)
        async with self._submit_lock:
            if request_id:
                existing = await self._repository.get_by_request_id(request_id)
                if existing:
                    if (
                        existing.kind is not kind
                        or existing.payload != normalized_payload
                        or existing.target_driver is not target_driver
                    ):
                        raise BrowserTaskError("请求标识已被另一项浏览器任务使用")
                    if (
                        existing.target_driver is BrowserDriver.EXTENSION
                        and existing.status is BrowserTaskStatus.QUEUED
                    ):
                        self._claim_waiter.notify()
                    return existing
            now = datetime.now(UTC)
            task = BrowserTask(
                task_id=uuid4().hex,
                request_id=request_id,
                kind=kind,
                payload=normalized_payload,
                target_driver=target_driver,
                created_at=now,
                updated_at=now,
            )
            await self._repository.save(task)
            if target_driver is BrowserDriver.EXTENSION:
                self._claim_waiter.notify()
            return task

    async def wait_for_claim[ClaimT](
        self,
        operation: Callable[[], Awaitable[ClaimT | None]],
        wait_seconds: float,
        recheck_seconds: float = 1,
    ) -> ClaimT | None:
        """有界等待扩展任务出现并调用原子领取操作。

        Args:
            operation: 每次检查时调用的原子领取操作。
            wait_seconds: 最长等待秒数，必须在零到三十秒之间。
            recheck_seconds: 覆盖进程外提交的周期检查间隔。

        Returns:
            已领取任务；等待超时且仍无任务时返回 ``None``。

        Raises:
            BrowserTaskError: 等待参数无效。
        """
        return await self._claim_waiter.wait_for_claim(
            operation,
            wait_seconds,
            recheck_seconds,
        )

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

    async def cancel_before_running(
        self,
        task_id: str,
        message: str = "等待浏览器执行超时，任务已取消",
    ) -> BrowserTask:
        """在页面执行前原子取消排队或已领取任务。

        ``claimed`` 任务仍须先凭租约推进到 ``running`` 才能操作页面。
        本方法与该推进使用同一状态比较更新，因此取消成功后陈旧执行器
        会在页面动作前因租约状态无效而停止。已经进入 ``running`` 的
        任务不会被取消。

        Args:
            task_id: 任务唯一标识。
            message: 不包含敏感数据的取消原因。

        Returns:
            取消后的明确失败任务，或已经开始、完成的最新任务。

        Raises:
            BrowserTaskError: 任务不存在。
        """
        while True:
            task = await self.require(task_id)
            if task.status not in {
                BrowserTaskStatus.QUEUED,
                BrowserTaskStatus.CLAIMED,
            }:
                return task
            canceled = task.model_copy(
                update={
                    "status": BrowserTaskStatus.FAILED,
                    "executor_id": None,
                    "extension_id": None,
                    "lease_expires_at": None,
                    "message": message[:1000],
                    "updated_at": datetime.now(UTC),
                }
            )
            if await self._repository.save_if_status(
                canceled,
                task.status,
                clear_lease=True,
            ):
                return canceled

    async def retry(self, task_id: str) -> BrowserTask:
        """重新排队一个明确失败的任务。

        Args:
            task_id: 任务唯一标识。

        Returns:
            已重新排队的任务。

        Raises:
            BrowserTaskError: 任务不存在、结果不确定或状态不允许重试。
        """
        queued = await requeue_failed_task(
            self._repository,
            await self.require(task_id),
        )
        if queued.target_driver is BrowserDriver.EXTENSION:
            self._claim_waiter.notify()
        return queued

    async def review(self, task_id: str, succeeded: bool) -> BrowserTask:
        """记录人工核对结论，解除结果不确定任务的重试禁令。

        Args:
            task_id: 需要人工核对的任务标识。
            succeeded: 用户确认操作已经生效时为真。

        Returns:
            转为成功或明确失败的任务。

        Raises:
            BrowserTaskError: 任务不存在、不是待核对状态或状态已经变化。
        """
        return await resolve_reviewed_task(
            self._repository,
            await self.require(task_id),
            succeeded,
        )

    async def consume_login_qrcode(self, task_id: str) -> None:
        """从已交付任务中移除短期二维码图像。

        Args:
            task_id: 二维码任务标识。
        """
        task = await self.require(task_id)
        if (
            task.kind is not BrowserTaskKind.GET_LOGIN_QRCODE
            or task.status is not BrowserTaskStatus.SUCCEEDED
            or not task.result
            or task.result.get("consumed") is True
            or not task.result.get("image_data_url")
        ):
            return
        result = {
            **task.result,
            "image_data_url": None,
            "consumed": True,
        }
        consumed = task.model_copy(
            update={
                "result": result,
                "message": "登录二维码已交付，任务记录中的图像已清除",
                "updated_at": datetime.now(UTC),
            }
        )
        await self._repository.save_if_status(
            consumed,
            BrowserTaskStatus.SUCCEEDED,
        )
