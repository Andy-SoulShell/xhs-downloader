"""内容发布 SQLite 仓储测试。"""

from datetime import UTC, datetime, timedelta
from hashlib import sha256

from aiosqlite import connect

from src.domain import PublicationMode, PublicationTask, PublicationTaskStatus
from src.infrastructure import (
    SqliteExtensionCredentialRepository,
    SqlitePublicationDraftRepository,
    SqlitePublicationTaskRepository,
)
from tests.helpers import make_publication_draft


def _make_task(
    status: PublicationTaskStatus,
    *,
    task_id: str = "synthetic-task",
) -> PublicationTask:
    draft = make_publication_draft()
    now = datetime.now(UTC)
    return PublicationTask(
        task_id=task_id,
        package=draft,
        package_fingerprint=draft.fingerprint(),
        mode=PublicationMode.MANUAL,
        status=status,
        scheduled_at=now,
        created_at=now,
        updated_at=now,
    )


async def test_draft_repository_round_trips_and_ignores_invalid_rows(
    tmp_path,
) -> None:
    """确保草稿仓储支持更新、查询、删除和损坏记录隔离。

    Args:
        tmp_path: pytest 提供的临时目录。
    """
    database = tmp_path.joinpath("state.db")
    repository = SqlitePublicationDraftRepository(database)
    draft = make_publication_draft()
    await repository.save_draft(draft)
    await repository.save_draft(draft.model_copy(update={"title": "已更新"}))
    async with connect(database) as connection:
        await connection.execute(
            "INSERT INTO publication_draft VALUES (?, ?, ?, ?)",
            (
                "invalid",
                "{}",
                draft.created_at.isoformat(),
                draft.updated_at.isoformat(),
            ),
        )
        await connection.commit()

    assert (await repository.get_draft(draft.draft_id)).title == "已更新"
    assert [item.draft_id for item in await repository.list_drafts(10)] == [
        draft.draft_id
    ]
    assert await repository.get_draft("missing") is None
    await repository.delete_draft(draft.draft_id)
    assert await repository.list_drafts(10) == []


async def test_task_repository_claims_with_compare_and_swap(tmp_path) -> None:
    """确保就绪任务只能领取一次且租约可校验与清除。

    Args:
        tmp_path: pytest 提供的临时目录。
    """
    repository = SqlitePublicationTaskRepository(tmp_path.joinpath("state.db"))
    task = _make_task(PublicationTaskStatus.READY)
    await repository.save_task(task)
    now = datetime.now(UTC)
    lease_hash = sha256(b"lease").hexdigest()

    claimed = await repository.claim_ready(
        "synthetic-extension",
        now,
        now + timedelta(minutes=5),
        lease_hash,
        task.task_id,
    )
    repeated = await repository.claim_ready(
        "other-extension",
        now,
        now + timedelta(minutes=5),
        "b" * 64,
        task.task_id,
    )

    assert claimed.status is PublicationTaskStatus.CLAIMED
    assert claimed.attempts == 1
    assert repeated is None
    assert await repository.validate_lease(task.task_id, lease_hash)
    assert await repository.has_active_task(task.package.draft_id)
    await repository.clear_lease(task.task_id)
    assert not await repository.validate_lease(task.task_id, lease_hash)


async def test_task_repository_lists_and_updates_expected_status(
    tmp_path,
) -> None:
    """确保任务按更新时间列出且状态比较交换拒绝陈旧写入。

    Args:
        tmp_path: pytest 提供的临时目录。
    """
    database = tmp_path.joinpath("state.db")
    repository = SqlitePublicationTaskRepository(database)
    ready = _make_task(PublicationTaskStatus.READY, task_id="ready")
    done = _make_task(PublicationTaskStatus.PUBLISHED, task_id="done")
    await repository.save_task(ready)
    await repository.save_task(done)
    canceled = ready.model_copy(update={"status": PublicationTaskStatus.CANCELED})

    assert not await repository.save_task_if_status(
        canceled, PublicationTaskStatus.SCHEDULED
    )
    assert await repository.save_task_if_status(canceled, PublicationTaskStatus.READY)
    assert [item.task_id for item in await repository.list_active_tasks()] == []
    assert {item.task_id for item in await repository.list_tasks(10)} == {
        "ready",
        "done",
    }
    assert not await repository.has_active_task(ready.package.draft_id)


async def test_extension_credentials_rotate_and_validate(tmp_path) -> None:
    """确保扩展能力令牌仅保存摘要且重新登记会使旧令牌失效。

    Args:
        tmp_path: pytest 提供的临时目录。
    """
    database = tmp_path.joinpath("state.db")
    repository = SqliteExtensionCredentialRepository(database)
    now = datetime.now(UTC)
    await repository.register_extension("extension", "first", now)
    assert await repository.validate_extension("extension", "first")
    await repository.register_extension("extension", "second", now)

    assert not await repository.validate_extension("extension", "first")
    assert await repository.validate_extension("extension", "second")
