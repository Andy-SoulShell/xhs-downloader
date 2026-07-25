"""浏览器任务 JSON 快照与 SQLite 冗余列一致性测试。"""

from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from aiosqlite import connect
from xhs_adapters.sqlite import SqliteBrowserTaskRepository
from xhs_core.domain import BrowserTask, BrowserTaskKind, BrowserTaskStatus

_COLUMN_UPDATES = {
    "lease_expires_at": (
        "UPDATE browser_task SET lease_expires_at = ? WHERE task_id = ?"
    ),
    "created_at": "UPDATE browser_task SET created_at = ? WHERE task_id = ?",
    "updated_at": "UPDATE browser_task SET updated_at = ? WHERE task_id = ?",
}


@pytest.mark.parametrize(
    "column",
    ["lease_expires_at", "created_at", "updated_at"],
)
async def test_time_column_mismatch_is_removed(
    tmp_path: Path,
    column: str,
) -> None:
    """确保查询用时间列与 JSON 不一致时隔离损坏记录。

    Args:
        tmp_path: Pytest 提供的临时目录。
        column: 待篡改的冗余时间列。
    """
    database = tmp_path.joinpath("state.db")
    repository = SqliteBrowserTaskRepository(database)
    now = datetime.now(UTC)
    task = BrowserTask(
        task_id=f"mismatched-{column}",
        kind=BrowserTaskKind.LIST_FEEDS,
        status=BrowserTaskStatus.RUNNING,
        lease_expires_at=now + timedelta(minutes=1),
        created_at=now,
        updated_at=now,
    )
    await repository.save(task)
    async with connect(database) as connection:
        await connection.execute(
            _COLUMN_UPDATES[column],
            ((now - timedelta(minutes=1)).isoformat(), task.task_id),
        )
        await connection.commit()

    loaded = (
        await repository.list_expired(now)
        if column == "lease_expires_at"
        else await repository.list_recent(10)
    )

    assert loaded == []
    assert await repository.get(task.task_id) is None


async def test_non_text_timestamp_is_removed(tmp_path: Path) -> None:
    """确保 SQLite 非文本时间值不会绕过损坏记录隔离。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    database = tmp_path.joinpath("state.db")
    repository = SqliteBrowserTaskRepository(database)
    now = datetime.now(UTC)
    task = BrowserTask(
        task_id="binary-timestamp",
        kind=BrowserTaskKind.LIST_FEEDS,
        created_at=now,
        updated_at=now,
    )
    await repository.save(task)
    async with connect(database) as connection:
        await connection.execute(
            "UPDATE browser_task SET updated_at = ? WHERE task_id = ?",
            (b"not-a-text-timestamp", task.task_id),
        )
        await connection.commit()

    assert await repository.list_recent(10) == []
