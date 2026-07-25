"""浏览器驱动领取任务与回传结果用例。"""

from datetime import UTC, datetime, timedelta
from hashlib import sha256
from secrets import token_urlsafe

from pydantic import JsonValue

from xhs_core.domain import (
    BrowserDriver,
    BrowserTask,
    BrowserTaskClaim,
    BrowserTaskError,
    BrowserTaskKind,
    BrowserTaskStatus,
)
from xhs_core.domain.browser_ports import BrowserTaskRepository
from xhs_core.domain.browser_requests import validate_browser_task_result

_ACTIVE = {BrowserTaskStatus.CLAIMED, BrowserTaskStatus.RUNNING}
_TERMINAL = {
    BrowserTaskStatus.SUCCEEDED,
    BrowserTaskStatus.FAILED,
    BrowserTaskStatus.NEEDS_REVIEW,
}
_RECOVERABLE = {
    BrowserTaskKind.CHECK_LOGIN_STATUS,
    BrowserTaskKind.GET_LOGIN_QRCODE,
    BrowserTaskKind.DELETE_COOKIES,
    BrowserTaskKind.LIST_FEEDS,
    BrowserTaskKind.SEARCH_FEEDS,
    BrowserTaskKind.GET_FEED_DETAIL,
    BrowserTaskKind.GET_USER_PROFILE,
    BrowserTaskKind.GET_MY_PROFILE,
    BrowserTaskKind.SET_LIKE,
    BrowserTaskKind.SET_FAVORITE,
}


class BrowserExecutionService:
    """向浏览器执行器提供短期租约并维护执行状态。

    Args:
        repository: 浏览器任务仓储。
        lease_seconds: 执行器无心跳时的租约秒数。
    """

    def __init__(
        self,
        repository: BrowserTaskRepository,
        lease_seconds: int,
    ) -> None:
        self._repository = repository
        self._lease_seconds = lease_seconds

    async def claim(
        self,
        executor_id: str,
        target_driver: BrowserDriver = BrowserDriver.EXTENSION,
    ) -> BrowserTaskClaim | None:
        """原子领取最早排队的浏览器任务。

        Args:
            executor_id: 已登记扩展或受管 Worker 实例 ID。
            target_driver: 只领取该驱动的排队任务。

        Returns:
            带短期令牌的任务；队列为空时返回 ``None``。
        """
        await self.reconcile_expired()
        now = datetime.now(UTC)
        token = token_urlsafe(32)
        task = await self._repository.claim_next(
            executor_id,
            now,
            now + timedelta(seconds=self._lease_seconds),
            _token_hash(token),
            target_driver,
        )
        return BrowserTaskClaim(task=task, lease_token=token) if task else None

    async def update(
        self,
        task_id: str,
        lease_token: str,
        status: BrowserTaskStatus,
        message: str,
        result: dict[str, JsonValue] | None = None,
    ) -> BrowserTask:
        """推进任务状态并在终态保存结构化结果。

        Args:
            task_id: 任务唯一标识。
            lease_token: 浏览器执行器领取任务时获得的短期令牌。
            status: 运行中或终态状态。
            message: 不含用户原文的执行摘要。
            result: 浏览器执行器返回的结构化结果。

        Returns:
            更新后的任务。

        Raises:
            BrowserTaskError: 租约、状态转换或成功结果无效。
        """
        task = await self._require_lease(task_id, lease_token)
        allowed = _allowed_transitions(task.status)
        if status not in allowed:
            raise BrowserTaskError(f"不能从 {task.status.value} 转换到 {status.value}")
        if status is BrowserTaskStatus.SUCCEEDED and result is None:
            raise BrowserTaskError("成功任务必须返回结构化结果")
        normalized_result = (
            validate_browser_task_result(task.kind, result)
            if status is BrowserTaskStatus.SUCCEEDED and result is not None
            else result
        )
        now = datetime.now(UTC)
        terminal = status in _TERMINAL
        updated = task.model_copy(
            update={
                "status": status,
                "result": normalized_result if terminal else task.result,
                "message": message[:1000],
                "lease_expires_at": (
                    None if terminal else now + timedelta(seconds=self._lease_seconds)
                ),
                "updated_at": now,
            }
        )
        if not await self._repository.save_if_status(updated, task.status):
            raise BrowserTaskError("浏览器任务状态已经变化，请刷新后重试")
        if terminal:
            await self._repository.clear_lease(task_id)
        return updated

    async def reconcile_expired(self) -> None:
        """恢复租约过期任务，并隔离可能已经产生外部写入的任务。"""
        now = datetime.now(UTC)
        for task in await self._repository.list_expired(now):
            recoverable = (
                task.status is BrowserTaskStatus.CLAIMED or task.kind in _RECOVERABLE
            )
            status = (
                BrowserTaskStatus.QUEUED
                if recoverable
                else BrowserTaskStatus.NEEDS_REVIEW
            )
            message = (
                "租约过期，任务已重新排队"
                if recoverable
                else "执行中租约过期，请人工核对平台结果"
            )
            updated = task.model_copy(
                update={
                    "status": status,
                    "executor_id": None,
                    "extension_id": None,
                    "lease_expires_at": None,
                    "message": message,
                    "updated_at": now,
                }
            )
            if await self._repository.save_if_status(updated, task.status):
                await self._repository.clear_lease(task.task_id)

    async def _require_lease(
        self,
        task_id: str,
        lease_token: str,
    ) -> BrowserTask:
        task = await self._repository.get(task_id)
        valid_hash = await self._repository.validate_lease(
            task_id,
            _token_hash(lease_token),
        )
        lease_active = bool(
            task
            and task.status in _ACTIVE
            and task.lease_expires_at
            and task.lease_expires_at > datetime.now(UTC)
        )
        if not task or not valid_hash or not lease_active:
            raise BrowserTaskError("浏览器任务租约无效或已经过期")
        return task


def _allowed_transitions(
    status: BrowserTaskStatus,
) -> set[BrowserTaskStatus]:
    if status is BrowserTaskStatus.CLAIMED:
        return {BrowserTaskStatus.RUNNING, *_TERMINAL}
    if status is BrowserTaskStatus.RUNNING:
        return {BrowserTaskStatus.RUNNING, *_TERMINAL}
    return set()


def _token_hash(token: str) -> str:
    return sha256(token.encode("utf-8")).hexdigest()
