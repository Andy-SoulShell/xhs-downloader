"""浏览器执行状态回传的版本比较交换测试。"""

import asyncio
from datetime import UTC, datetime, timedelta
from hashlib import sha256
from pathlib import Path

import pytest
from aiosqlite import connect
from xhs_adapters.sqlite import SqliteBrowserTaskRepository
from xhs_core.application import BrowserExecutionService, BrowserTaskService
from xhs_core.domain import (
    BrowserTask,
    BrowserTaskError,
    BrowserTaskKind,
    BrowserTaskLeaseConflictError,
    BrowserTaskStatus,
)


class _PausedUpdateRepository(SqliteBrowserTaskRepository):
    """在指定状态提交前暂停，暴露恢复与重新领取竞态。"""

    def __init__(self, database: Path) -> None:
        super().__init__(database)
        self.armed = False
        self.update_waiting = asyncio.Event()
        self.release_update = asyncio.Event()

    async def save_if_status(
        self,
        task: BrowserTask,
        expected: BrowserTaskStatus,
        *,
        expected_updated_at: datetime | None = None,
        expected_lease_expires_at: datetime | None = None,
        expected_lease_hash: str | None = None,
        clear_lease: bool = False,
    ) -> bool:
        """在已布防时暂停一次状态回传。

        Args:
            task: 待保存的新任务。
            expected: 预期旧状态。
            expected_updated_at: 预期旧更新时间。
            expected_lease_expires_at: 预期旧租约期限。
            expected_lease_hash: 预期当前租约摘要。
            clear_lease: 是否原子清除租约。

        Returns:
            完整快照比较交换是否成功。
        """
        if self.armed:
            self.armed = False
            self.update_waiting.set()
            await self.release_update.wait()
        return await super().save_if_status(
            task,
            expected,
            expected_updated_at=expected_updated_at,
            expected_lease_expires_at=expected_lease_expires_at,
            expected_lease_hash=expected_lease_hash,
            clear_lease=clear_lease,
        )


@pytest.mark.parametrize(
    "stale_status",
    [BrowserTaskStatus.RUNNING, BrowserTaskStatus.FAILED],
)
async def test_stale_update_cannot_overwrite_reclaimed_running_task(
    tmp_path: Path,
    stale_status: BrowserTaskStatus,
) -> None:
    """旧租约心跳或终态不能覆盖恢复后新 Worker 的同状态任务。

    Args:
        tmp_path: Pytest 提供的临时目录。
        stale_status: 旧 Worker 尝试保存的运行态或终态。
    """
    database = tmp_path.joinpath("state.db")
    paused = _PausedUpdateRepository(database)
    old_execution = BrowserExecutionService(paused, lease_seconds=60)
    tasks = BrowserTaskService(paused)
    submitted = await tasks.submit(BrowserTaskKind.LIST_FEEDS, {})
    old_claim = await old_execution.claim("old-worker")
    assert old_claim is not None
    running = await old_execution.update(
        submitted.task_id,
        old_claim.lease_token,
        BrowserTaskStatus.RUNNING,
        "旧 Worker 开始执行",
    )
    paused.armed = True
    stale_update = asyncio.create_task(
        old_execution.update(
            running.task_id,
            old_claim.lease_token,
            stale_status,
            "旧 Worker 的陈旧回传",
        )
    )
    await asyncio.wait_for(paused.update_waiting.wait(), timeout=1)

    plain = SqliteBrowserTaskRepository(database)
    expired = running.model_copy(
        update={
            "lease_expires_at": datetime.now(UTC) - timedelta(seconds=1),
            "updated_at": running.updated_at + timedelta(seconds=1),
        }
    )
    await plain.save(expired)
    new_execution = BrowserExecutionService(plain, lease_seconds=60)
    await new_execution.reconcile_expired()
    new_claim = await new_execution.claim("new-worker")
    assert new_claim is not None
    new_running = await new_execution.update(
        submitted.task_id,
        new_claim.lease_token,
        BrowserTaskStatus.RUNNING,
        "新 Worker 正在执行",
    )

    paused.release_update.set()
    with pytest.raises(BrowserTaskError, match="状态已经变化"):
        await stale_update

    current = await plain.get(submitted.task_id)
    assert current is not None
    assert current.status is BrowserTaskStatus.RUNNING
    assert current.updated_at == new_running.updated_at
    assert current.lease_expires_at == new_running.lease_expires_at
    assert current.executor_id == "new-worker"
    assert not await plain.validate_lease(
        submitted.task_id,
        sha256(old_claim.lease_token.encode()).hexdigest(),
    )
    assert await plain.validate_lease(
        submitted.task_id,
        sha256(new_claim.lease_token.encode()).hexdigest(),
    )


async def test_update_cas_rejects_replaced_lease_hash(tmp_path: Path) -> None:
    """确保校验后仅租约摘要被替换也会拒绝旧 Worker 更新。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    database = tmp_path.joinpath("state.db")
    repository = _PausedUpdateRepository(database)
    execution = BrowserExecutionService(repository, lease_seconds=60)
    tasks = BrowserTaskService(repository)
    submitted = await tasks.submit(BrowserTaskKind.LIST_FEEDS, {})
    claim = await execution.claim("old-worker")
    assert claim is not None
    running = await execution.update(
        submitted.task_id,
        claim.lease_token,
        BrowserTaskStatus.RUNNING,
        "旧 Worker 开始执行",
    )
    repository.armed = True
    stale_update = asyncio.create_task(
        execution.update(
            running.task_id,
            claim.lease_token,
            BrowserTaskStatus.RUNNING,
            "旧 Worker 尝试续租",
        )
    )
    await asyncio.wait_for(repository.update_waiting.wait(), timeout=1)
    replacement_hash = "b" * 64
    async with connect(database) as database_connection:
        await database_connection.execute(
            "UPDATE browser_task SET lease_hash = ? WHERE task_id = ?",
            (replacement_hash, submitted.task_id),
        )
        await database_connection.commit()

    repository.release_update.set()
    with pytest.raises(BrowserTaskLeaseConflictError):
        await stale_update

    assert await repository.validate_lease(submitted.task_id, replacement_hash)
