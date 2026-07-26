"""浏览器任务终态处置：显式重试与人工核对。"""

from datetime import UTC, datetime

from xhs_core.domain import (
    BrowserTask,
    BrowserTaskError,
    BrowserTaskStatus,
    can_retry_browser_task,
)
from xhs_core.domain.browser_ports import BrowserTaskRepository


async def requeue_failed_task(
    repository: BrowserTaskRepository,
    task: BrowserTask,
) -> BrowserTask:
    """把一个明确失败的任务重新排队。

    结果不确定的任务禁止走这条路径，必须先由用户核对实际结果，
    否则可能造成点赞、评论等写操作重复生效。

    Args:
        repository: 浏览器任务仓储。
        task: 当前任务快照。

    Returns:
        已重新排队的任务。

    Raises:
        BrowserTaskError: 结果不确定或状态不允许重试。
    """
    if not can_retry_browser_task(task):
        if task.status is BrowserTaskStatus.NEEDS_REVIEW:
            raise BrowserTaskError("结果不确定的任务必须人工核对，不能直接重试")
        raise BrowserTaskError("只有明确失败的浏览器任务可以重试")
    queued = task.model_copy(
        update={
            "status": BrowserTaskStatus.QUEUED,
            "result": None,
            "executor_id": None,
            "extension_id": None,
            "lease_expires_at": None,
            "message": "等待浏览器重试",
            "updated_at": datetime.now(UTC),
        }
    )
    await _save_or_conflict(repository, queued, BrowserTaskStatus.FAILED)
    return queued


async def resolve_reviewed_task(
    repository: BrowserTaskRepository,
    task: BrowserTask,
    succeeded: bool,
) -> BrowserTask:
    """记录人工核对结论，解除结果不确定任务的重试禁令。

    确认已生效的任务转为成功并就此结束；确认未生效的转为明确失败，
    随后可以按正常重试路径再次执行。

    Args:
        repository: 浏览器任务仓储。
        task: 当前任务快照。
        succeeded: 用户确认操作已经生效时为真。

    Returns:
        转为成功或明确失败的任务。

    Raises:
        BrowserTaskError: 任务不是待核对状态或状态已经变化。
    """
    if task.status is not BrowserTaskStatus.NEEDS_REVIEW:
        raise BrowserTaskError("只有需要人工核对的浏览器任务可以确认结果")
    reviewed = task.model_copy(
        update={
            "status": (
                BrowserTaskStatus.SUCCEEDED if succeeded else BrowserTaskStatus.FAILED
            ),
            "message": (
                "已由用户确认操作生效" if succeeded else "已由用户确认操作未生效"
            ),
            "updated_at": datetime.now(UTC),
        }
    )
    await _save_or_conflict(repository, reviewed, BrowserTaskStatus.NEEDS_REVIEW)
    return reviewed


async def _save_or_conflict(
    repository: BrowserTaskRepository,
    task: BrowserTask,
    expected: BrowserTaskStatus,
) -> None:
    if not await repository.save_if_status(task, expected, clear_lease=True):
        raise BrowserTaskError("浏览器任务状态已经变化，请刷新后重试")
