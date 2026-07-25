"""浏览器任务租约恢复的版本比较交换测试。"""

import asyncio
from datetime import UTC, datetime, timedelta
from hashlib import sha256
from pathlib import Path

import pytest
from xhs_adapters.sqlite import SqliteBrowserTaskRepository
from xhs_core.application import BrowserExecutionService
from xhs_core.domain import BrowserTask, BrowserTaskKind, BrowserTaskStatus


class _HeartbeatRaceRepository(SqliteBrowserTaskRepository):
    """在巡检读取后模拟执行器对同状态任务续租。"""

    renewed: BrowserTask | None = None

    async def list_expired(self, now: datetime) -> list[BrowserTask]:
        """返回陈旧快照，同时先持久化新的心跳租约。

        Args:
            now: 巡检当前时间。

        Returns:
            心跳发生前读取到的过期任务快照。
        """
        stale = await super().list_expired(now)
        if not stale:
            return stale
        task = stale[0]
        renewed_at = max(datetime.now(UTC), task.updated_at + timedelta(seconds=1))
        self.renewed = task.model_copy(
            update={
                "lease_expires_at": renewed_at + timedelta(minutes=1),
                "updated_at": renewed_at,
            }
        )
        assert await super().save_if_status(self.renewed, task.status)
        return stale


class _CommittedRecoveryRepository(SqliteBrowserTaskRepository):
    """在恢复事务提交后暂停，让另一连接立即领取任务。"""

    def __init__(self, database: Path) -> None:
        super().__init__(database)
        self.recovery_committed = asyncio.Event()
        self.release_recovery = asyncio.Event()

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
        """保存任务，并在恢复原子提交后提供并发测试栅栏。

        Args:
            task: 新任务快照。
            expected: 数据库必须匹配的旧状态。
            expected_updated_at: 可选的旧快照更新时间。
            expected_lease_expires_at: 可选的旧租约到期时间。
            expected_lease_hash: 可选的当前租约摘要。
            clear_lease: 是否在同一原子更新中清除旧租约。

        Returns:
            所有指定条件匹配并成功更新一条记录时返回真。
        """
        saved = await super().save_if_status(
            task,
            expected,
            expected_updated_at=expected_updated_at,
            expected_lease_expires_at=expected_lease_expires_at,
            expected_lease_hash=expected_lease_hash,
            clear_lease=clear_lease,
        )
        if saved and clear_lease and expected_updated_at is not None:
            self.recovery_committed.set()
            await self.release_recovery.wait()
        return saved


def _task(task_id: str = "synthetic-recovery-task") -> BrowserTask:
    now = datetime.now(UTC)
    return BrowserTask(
        task_id=task_id,
        request_id=f"request-{task_id}",
        kind=BrowserTaskKind.LIST_FEEDS,
        created_at=now,
        updated_at=now,
    )


async def _expire_running_task(
    repository: SqliteBrowserTaskRepository,
    execution: BrowserExecutionService,
) -> tuple[BrowserTask, str]:
    task = _task()
    await repository.save(task)
    claim = await execution.claim("old-worker")
    assert claim is not None
    running = await execution.update(
        task.task_id,
        claim.lease_token,
        BrowserTaskStatus.RUNNING,
        "正在执行合成读取任务",
    )
    expired = running.model_copy(
        update={
            "lease_expires_at": datetime.now(UTC) - timedelta(seconds=1),
            "updated_at": running.updated_at + timedelta(seconds=1),
        }
    )
    await repository.save(expired)
    return expired, claim.lease_token


async def test_recovery_does_not_overwrite_concurrent_heartbeat(
    tmp_path: Path,
) -> None:
    """确保陈旧巡检不能覆盖同状态心跳续租。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    repository = _HeartbeatRaceRepository(tmp_path.joinpath("state.db"))
    execution = BrowserExecutionService(repository, lease_seconds=60)
    expired, lease_token = await _expire_running_task(repository, execution)

    await execution.reconcile_expired()

    current = await repository.get(expired.task_id)
    assert current is not None
    assert repository.renewed is not None
    assert current.status is BrowserTaskStatus.RUNNING
    assert current.updated_at == repository.renewed.updated_at
    assert current.lease_expires_at == repository.renewed.lease_expires_at
    assert await repository.validate_lease(
        expired.task_id,
        sha256(lease_token.encode("utf-8")).hexdigest(),
    )


@pytest.mark.parametrize("changed_field", ["updated_at", "lease_expires_at"])
async def test_recovery_requires_exact_lease_snapshot(
    tmp_path: Path,
    changed_field: str,
) -> None:
    """确保更新时间或租约任一变化都会拒绝陈旧恢复。

    Args:
        tmp_path: Pytest 提供的临时目录。
        changed_field: 模拟并发修改的快照字段。
    """
    repository = SqliteBrowserTaskRepository(tmp_path.joinpath("state.db"))
    now = datetime.now(UTC)
    task = _task(f"synthetic-{changed_field}")
    await repository.save(task)
    old_hash = sha256(b"old-worker-lease").hexdigest()
    stale = await repository.claim_next(
        "old-worker",
        now,
        now - timedelta(seconds=1),
        old_hash,
    )
    assert stale is not None
    changed = stale.model_copy(
        update={
            changed_field: (
                stale.updated_at + timedelta(seconds=1)
                if changed_field == "updated_at"
                else stale.lease_expires_at + timedelta(minutes=1)
            )
        }
    )
    await repository.save(changed)
    recovered = stale.model_copy(
        update={
            "status": BrowserTaskStatus.QUEUED,
            "executor_id": None,
            "extension_id": None,
            "lease_expires_at": None,
            "updated_at": stale.updated_at + timedelta(minutes=2),
        }
    )

    saved = await repository.save_if_status(
        recovered,
        stale.status,
        expected_updated_at=stale.updated_at,
        expected_lease_expires_at=stale.lease_expires_at,
        clear_lease=True,
    )

    assert saved is False
    assert await repository.validate_lease(task.task_id, old_hash)


async def test_recovery_never_clears_new_worker_lease(tmp_path: Path) -> None:
    """确保恢复提交后新 Worker 的租约不会被旧协调器清除。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    database = tmp_path.joinpath("state.db")
    repository = _CommittedRecoveryRepository(database)
    execution = BrowserExecutionService(repository, lease_seconds=60)
    expired, _ = await _expire_running_task(repository, execution)
    reconciliation = asyncio.create_task(execution.reconcile_expired())
    await asyncio.wait_for(repository.recovery_committed.wait(), timeout=2)
    new_repository = SqliteBrowserTaskRepository(database)
    now = datetime.now(UTC)
    new_hash = sha256(b"new-worker-lease").hexdigest()
    reclaimed = await new_repository.claim_next(
        "new-worker",
        now,
        now + timedelta(minutes=1),
        new_hash,
    )
    repository.release_recovery.set()
    await reconciliation

    current = await new_repository.get(expired.task_id)
    assert reclaimed is not None
    assert current is not None
    assert current.status is BrowserTaskStatus.CLAIMED
    assert current.executor_id == "new-worker"
    assert await new_repository.validate_lease(expired.task_id, new_hash)
