"""发布租约恢复的版本比较交换测试。"""

from datetime import UTC, datetime, timedelta
from hashlib import sha256
from pathlib import Path

from xhs_adapters.sqlite import SqlitePublicationTaskRepository
from xhs_core.application import PublicationScheduler
from xhs_core.domain import (
    PublicationMode,
    PublicationTask,
    PublicationTaskStatus,
)

from tests.helpers import make_publication_draft


class _HeartbeatRaceRepository(SqlitePublicationTaskRepository):
    """在巡检读取后模拟同状态心跳续租。"""

    async def list_active_tasks(self) -> list[PublicationTask]:
        """返回陈旧快照，同时先持久化更新后的租约。

        Returns:
            巡检已经读取到的过期任务快照。
        """
        stale = await super().list_active_tasks()
        task = stale[0]
        renewed = task.model_copy(
            update={
                "lease_expires_at": datetime.now(UTC) + timedelta(minutes=1),
                "updated_at": task.updated_at + timedelta(seconds=1),
            }
        )
        await self.save_task(renewed)
        return stale


def _expired_waiting_task() -> PublicationTask:
    draft = make_publication_draft()
    now = datetime.now(UTC)
    return PublicationTask(
        task_id="synthetic-recovery-race",
        package=draft,
        package_fingerprint=draft.fingerprint(),
        mode=PublicationMode.MANUAL,
        status=PublicationTaskStatus.AWAITING_VERIFICATION,
        scheduled_at=now,
        lease_expires_at=now - timedelta(seconds=1),
        message="等待合成验证",
        created_at=now,
        updated_at=now,
    )


async def test_scheduler_does_not_overwrite_concurrent_heartbeat(
    tmp_path: Path,
) -> None:
    """确保陈旧巡检不能把已经续租的同状态任务恢复为就绪。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    repository = _HeartbeatRaceRepository(tmp_path.joinpath("state.db"))
    task = _expired_waiting_task()
    await repository.save_task(task)
    scheduler = PublicationScheduler(repository)

    await scheduler.reconcile()

    current = await repository.get_task(task.task_id)
    assert current is not None
    assert current.status is PublicationTaskStatus.AWAITING_VERIFICATION
    assert current.lease_expires_at is not None
    assert current.lease_expires_at > datetime.now(UTC)


async def test_atomic_recovery_never_clears_new_claim_lease(tmp_path: Path) -> None:
    """确保恢复清旧租约后新 Worker 写入的租约保持有效。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    repository = SqlitePublicationTaskRepository(tmp_path.joinpath("state.db"))
    ready = _expired_waiting_task().model_copy(
        update={"status": PublicationTaskStatus.READY}
    )
    await repository.save_task(ready)
    now = datetime.now(UTC)
    old_hash = sha256(b"old-lease").hexdigest()
    claimed = await repository.claim_ready(
        "old-worker",
        now,
        now + timedelta(minutes=1),
        old_hash,
        ready.task_id,
    )
    assert claimed is not None
    recovered = claimed.model_copy(
        update={
            "status": PublicationTaskStatus.READY,
            "lease_expires_at": None,
            "updated_at": claimed.updated_at + timedelta(seconds=1),
        }
    )

    saved = await repository.save_task_if_status(
        recovered,
        PublicationTaskStatus.CLAIMED,
        claimed.updated_at,
        clear_lease=True,
    )
    new_hash = sha256(b"new-lease").hexdigest()
    reclaimed = await repository.claim_ready(
        "new-worker",
        now + timedelta(seconds=2),
        now + timedelta(minutes=2),
        new_hash,
        ready.task_id,
    )

    assert saved is True
    assert reclaimed is not None
    assert await repository.validate_lease(ready.task_id, new_hash)
