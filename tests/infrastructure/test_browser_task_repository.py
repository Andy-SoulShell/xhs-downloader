"""SQLite 浏览器任务仓储测试。"""

from datetime import UTC, datetime, timedelta
from hashlib import sha256

from aiosqlite import connect
from xhs_adapters.sqlite import SqliteBrowserTaskRepository
from xhs_core.domain import BrowserTask, BrowserTaskKind, BrowserTaskStatus


def _task(task_id: str = "synthetic-task") -> BrowserTask:
    now = datetime.now(UTC)
    return BrowserTask(
        task_id=task_id,
        request_id=f"request-{task_id}",
        kind=BrowserTaskKind.CHECK_LOGIN_STATUS,
        created_at=now,
        updated_at=now,
    )


async def test_browser_repository_round_trips_and_ignores_invalid_rows(
    tmp_path,
) -> None:
    """确保仓储支持幂等查询并隔离损坏记录。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    database = tmp_path.joinpath("state.db")
    repository = SqliteBrowserTaskRepository(database)
    task = _task()
    await repository.save(task)
    async with connect(database) as connection:
        await connection.execute(
            """
            INSERT INTO browser_task VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?)
            """,
            (
                "invalid",
                "invalid-request",
                "invalid",
                "queued",
                "{}",
                task.created_at.isoformat(),
                task.updated_at.isoformat(),
            ),
        )
        await connection.commit()

    assert (await repository.get(task.task_id)).kind is task.kind
    assert (await repository.get_by_request_id(task.request_id)).task_id == task.task_id
    assert await repository.get("missing") is None
    assert [item.task_id for item in await repository.list_recent(10)] == [task.task_id]


async def test_browser_repository_claim_is_atomic_and_lease_is_private(
    tmp_path,
) -> None:
    """确保任务只能领取一次，数据库只使用租约摘要校验。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    repository = SqliteBrowserTaskRepository(tmp_path.joinpath("state.db"))
    task = _task()
    await repository.save(task)
    now = datetime.now(UTC)
    lease_hash = sha256(b"synthetic-lease").hexdigest()
    claimed = await repository.claim_next(
        "synthetic-extension",
        now,
        now + timedelta(minutes=1),
        lease_hash,
    )
    repeated = await repository.claim_next(
        "other-extension",
        now,
        now + timedelta(minutes=1),
        "f" * 64,
    )

    assert claimed.status is BrowserTaskStatus.CLAIMED
    assert repeated is None
    assert await repository.validate_lease(task.task_id, lease_hash)
    await repository.clear_lease(task.task_id)
    assert not await repository.validate_lease(task.task_id, lease_hash)


async def test_browser_repository_compares_status_and_lists_expired(
    tmp_path,
) -> None:
    """确保陈旧写入被拒绝且仅返回租约到期任务。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    repository = SqliteBrowserTaskRepository(tmp_path.joinpath("state.db"))
    task = _task()
    await repository.save(task)
    now = datetime.now(UTC)
    claimed = await repository.claim_next(
        "extension",
        now,
        now - timedelta(seconds=1),
        "a" * 64,
    )
    completed = claimed.model_copy(
        update={
            "status": BrowserTaskStatus.SUCCEEDED,
            "result": {"logged_in": False},
        }
    )

    assert not await repository.save_if_status(
        completed,
        BrowserTaskStatus.RUNNING,
    )
    assert [item.task_id for item in await repository.list_expired(now)] == [
        task.task_id
    ]
    assert await repository.save_if_status(
        completed,
        BrowserTaskStatus.CLAIMED,
    )
