"""SQLite 浏览器任务仓储测试。"""

from datetime import UTC, datetime, timedelta
from hashlib import sha256

from aiosqlite import connect
from xhs_adapters.sqlite import SqliteBrowserTaskRepository
from xhs_core.domain import (
    BrowserDriver,
    BrowserTask,
    BrowserTaskKind,
    BrowserTaskStatus,
)


def _task(
    task_id: str = "synthetic-task",
    target_driver: BrowserDriver = BrowserDriver.EXTENSION,
) -> BrowserTask:
    now = datetime.now(UTC)
    return BrowserTask(
        task_id=task_id,
        request_id=f"request-{task_id}",
        kind=BrowserTaskKind.CHECK_LOGIN_STATUS,
        target_driver=target_driver,
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
            INSERT INTO browser_task (
                task_id, request_id, kind, target_driver, status, payload,
                lease_hash, lease_expires_at, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)
            """,
            (
                "invalid",
                "invalid-request",
                "invalid",
                BrowserDriver.EXTENSION.value,
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


async def test_browser_repository_claims_only_matching_driver(tmp_path) -> None:
    """确保扩展与受管任务混排时只能由目标驱动领取。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    repository = SqliteBrowserTaskRepository(tmp_path.joinpath("state.db"))
    managed = _task("managed-task", BrowserDriver.MANAGED)
    extension = _task("extension-task", BrowserDriver.EXTENSION)
    await repository.save(managed)
    await repository.save(extension)
    now = datetime.now(UTC)

    extension_claim = await repository.claim_next(
        "synthetic-extension",
        now,
        now + timedelta(minutes=1),
        "a" * 64,
        BrowserDriver.EXTENSION,
    )
    managed_claim = await repository.claim_next(
        "synthetic-managed-worker",
        now,
        now + timedelta(minutes=1),
        "b" * 64,
        BrowserDriver.MANAGED,
    )

    assert extension_claim.task_id == extension.task_id
    assert extension_claim.target_driver is BrowserDriver.EXTENSION
    assert extension_claim.executor_id == "synthetic-extension"
    assert extension_claim.extension_id == "synthetic-extension"
    assert managed_claim.task_id == managed.task_id
    assert managed_claim.target_driver is BrowserDriver.MANAGED
    assert managed_claim.executor_id == "synthetic-managed-worker"
    assert managed_claim.extension_id is None


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


async def test_browser_repository_migrates_legacy_driver_column(tmp_path) -> None:
    """确保旧任务表升级后默认由扩展执行且仍可读取和领取。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    database = tmp_path.joinpath("state.db")
    task = _task("legacy-task")
    legacy_payload = task.model_dump_json(
        exclude={"target_driver", "executor_id"},
    )
    async with connect(database) as connection:
        await connection.executescript(
            """
            CREATE TABLE browser_task (
                task_id TEXT PRIMARY KEY,
                request_id TEXT UNIQUE,
                kind TEXT NOT NULL,
                status TEXT NOT NULL,
                payload TEXT NOT NULL,
                lease_hash TEXT,
                lease_expires_at TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            """
        )
        await connection.execute(
            """
            INSERT INTO browser_task VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?)
            """,
            (
                task.task_id,
                task.request_id,
                task.kind.value,
                task.status.value,
                legacy_payload,
                task.created_at.isoformat(),
                task.updated_at.isoformat(),
            ),
        )
        await connection.commit()
    repository = SqliteBrowserTaskRepository(database)

    restored = await repository.get(task.task_id)
    now = datetime.now(UTC)
    claimed = await repository.claim_next(
        "synthetic-extension",
        now,
        now + timedelta(minutes=1),
        "c" * 64,
        BrowserDriver.EXTENSION,
    )
    async with connect(database) as connection:
        row = await (
            await connection.execute(
                "SELECT target_driver FROM browser_task WHERE task_id = ?",
                (task.task_id,),
            )
        ).fetchone()

    assert restored.target_driver is BrowserDriver.EXTENSION
    assert claimed.task_id == task.task_id
    assert claimed.target_driver is BrowserDriver.EXTENSION
    assert row[0] == BrowserDriver.EXTENSION.value
