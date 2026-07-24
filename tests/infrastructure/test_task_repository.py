"""SQLite 后台任务仓储测试。"""

from datetime import UTC, datetime, timedelta

from aiosqlite import connect
from xhs_adapters.sqlite import SqliteTaskRepository
from xhs_core.domain import DownloadTask, DownloadTaskStatus


def make_task(
    task_id: str,
    status: DownloadTaskStatus,
    updated_at: datetime,
) -> DownloadTask:
    """创建合成后台任务。

    Args:
        task_id: 任务唯一标识。
        status: 任务状态。
        updated_at: 最近更新时间。

    Returns:
        不访问真实平台的合成任务。
    """
    return DownloadTask(
        task_id=task_id,
        client_request_id=f"request-{task_id}",
        source_url="https://example.invalid/synthetic-work",
        media_indexes=[1, 2],
        status=status,
        created_at=updated_at - timedelta(minutes=1),
        updated_at=updated_at,
    )


async def test_task_repository_queries_status_and_recovery(tmp_path) -> None:
    """确保任务可按状态查询并识别待恢复项。

    Args:
        tmp_path: pytest 提供的临时目录。
    """
    repository = SqliteTaskRepository(tmp_path.joinpath("tasks.db"))
    now = datetime.now(UTC)
    queued = make_task("queued", DownloadTaskStatus.QUEUED, now)
    running = make_task(
        "running",
        DownloadTaskStatus.RUNNING,
        now + timedelta(seconds=1),
    )
    completed = make_task(
        "completed",
        DownloadTaskStatus.COMPLETED,
        now + timedelta(minutes=1),
    )
    for task in [queued, running, completed]:
        await repository.save(task)

    assert await repository.get("missing") is None
    assert (await repository.get("queued")).task_id == "queued"
    assert (
        await repository.get_by_request_id("request-completed")
    ).task_id == "completed"
    assert await repository.get_by_request_id("missing") is None
    assert [task.task_id for task in await repository.list_recent(2)] == [
        "completed",
        "running",
    ]
    assert [
        task.task_id
        for task in await repository.list_recent(
            10,
            DownloadTaskStatus.COMPLETED,
        )
    ] == ["completed"]
    assert {task.task_id for task in await repository.list_recoverable()} == {
        "queued",
        "running",
    }


async def test_task_repository_updates_and_ignores_invalid_payload(tmp_path) -> None:
    """确保任务更新原子生效且损坏记录不会污染列表。

    Args:
        tmp_path: pytest 提供的临时目录。
    """
    database = tmp_path.joinpath("tasks.db")
    repository = SqliteTaskRepository(database)
    now = datetime.now(UTC)
    task = make_task("task", DownloadTaskStatus.QUEUED, now)
    await repository.save(task)
    await repository.save(
        task.model_copy(
            update={
                "status": DownloadTaskStatus.COMPLETED,
                "message": "合成任务完成",
                "updated_at": now + timedelta(seconds=1),
            }
        )
    )
    async with connect(database) as connection:
        await connection.execute(
            """
            INSERT INTO download_task (
                task_id, client_request_id, status, payload,
                created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                "invalid",
                "request-invalid",
                "completed",
                "{}",
                now.isoformat(),
                (now + timedelta(minutes=2)).isoformat(),
            ),
        )
        await connection.commit()

    assert (await repository.get("task")).message == "合成任务完成"
    assert [item.task_id for item in await repository.list_recent(10)] == ["task"]
