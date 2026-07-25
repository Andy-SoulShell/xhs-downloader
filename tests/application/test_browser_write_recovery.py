"""浏览器写任务租约恢复安全规则测试。"""

from datetime import UTC, datetime, timedelta

import pytest
from xhs_adapters.sqlite import SqliteBrowserTaskRepository
from xhs_core.application import BrowserExecutionService, BrowserTaskService
from xhs_core.domain import BrowserTaskError, BrowserTaskKind, BrowserTaskStatus

_INTERACTION_KINDS = [
    BrowserTaskKind.SET_LIKE,
    BrowserTaskKind.SET_FAVORITE,
]
_PAYLOAD = {
    "feed_id": "synthetic-feed",
    "xsec_token": "synthetic-token",
    "active": True,
}


@pytest.mark.parametrize("kind", _INTERACTION_KINDS)
async def test_started_interaction_expiry_requires_review(tmp_path, kind) -> None:
    """确保已开始的点赞和收藏不会在结果不确定时自动重试。

    Args:
        tmp_path: Pytest 提供的临时目录。
        kind: 点赞或收藏任务类型。
    """
    repository = SqliteBrowserTaskRepository(tmp_path.joinpath("state.db"))
    tasks = BrowserTaskService(repository)
    execution = BrowserExecutionService(repository, lease_seconds=60)
    task = await tasks.submit(kind, _PAYLOAD)
    claim = await execution.claim("synthetic-executor")
    assert claim is not None
    running = await execution.update(
        task.task_id,
        claim.lease_token,
        BrowserTaskStatus.RUNNING,
        "正在更新互动状态",
    )
    await repository.save(
        running.model_copy(
            update={"lease_expires_at": datetime.now(UTC) - timedelta(seconds=1)}
        )
    )

    await execution.reconcile_expired()

    reviewed = await tasks.require(task.task_id)
    assert reviewed.status is BrowserTaskStatus.NEEDS_REVIEW
    assert "人工核对" in reviewed.message
    assert await execution.claim("retrying-executor") is None
    with pytest.raises(BrowserTaskError, match="不能直接重试"):
        await tasks.retry(task.task_id)


@pytest.mark.parametrize("kind", _INTERACTION_KINDS)
async def test_unstarted_interaction_expiry_returns_to_queue(tmp_path, kind) -> None:
    """确保仅领取但尚未开始的点赞和收藏仍可安全重新排队。

    Args:
        tmp_path: Pytest 提供的临时目录。
        kind: 点赞或收藏任务类型。
    """
    repository = SqliteBrowserTaskRepository(tmp_path.joinpath("state.db"))
    tasks = BrowserTaskService(repository)
    execution = BrowserExecutionService(repository, lease_seconds=60)
    task = await tasks.submit(kind, _PAYLOAD)
    claim = await execution.claim("synthetic-executor")
    assert claim is not None
    await repository.save(
        claim.task.model_copy(
            update={"lease_expires_at": datetime.now(UTC) - timedelta(seconds=1)}
        )
    )

    await execution.reconcile_expired()

    recovered = await tasks.require(task.task_id)
    assert recovered.status is BrowserTaskStatus.QUEUED
    assert "重新排队" in recovered.message
