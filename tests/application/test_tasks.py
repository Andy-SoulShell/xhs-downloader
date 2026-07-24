"""持久化后台任务协调器测试。"""

from asyncio import sleep
from datetime import UTC, datetime

import pytest

from src.application import DownloadTaskCoordinator
from src.domain import DownloadTask, DownloadTaskStatus, TaskStateError
from src.infrastructure import SqliteTaskRepository
from tests.interfaces.helpers import FakeService


async def test_task_submission_is_idempotent_and_completes(tmp_path) -> None:
    """确保重复客户端请求只产生一个可完成任务。

    Args:
        tmp_path: pytest 提供的临时目录。
    """
    repository = SqliteTaskRepository(tmp_path.joinpath("tasks.db"))
    coordinator = DownloadTaskCoordinator(FakeService(), repository, 2)
    await coordinator.start()

    first = await coordinator.submit(
        "https://example.invalid/synthetic-work",
        [2, 1, 2],
        False,
        "synthetic-request",
    )
    repeated = await coordinator.submit(
        "https://example.invalid/synthetic-work",
        [1],
        True,
        "synthetic-request",
    )
    completed = await _wait_for_status(
        coordinator,
        first.task_id,
        DownloadTaskStatus.COMPLETED,
    )

    assert repeated.task_id == first.task_id
    assert completed.media_indexes == [1, 2]
    assert completed.attempts == 1
    assert completed.detail is not None
    assert len(await coordinator.list_recent(10)) == 1
    await coordinator.close()


async def test_failed_task_can_be_retried(tmp_path) -> None:
    """确保失败任务可显式重试，其他状态会被拒绝。

    Args:
        tmp_path: pytest 提供的临时目录。
    """
    service = FakeService(fail=True)
    repository = SqliteTaskRepository(tmp_path.joinpath("tasks.db"))
    coordinator = DownloadTaskCoordinator(service, repository, 1)
    await coordinator.start()
    task = await coordinator.submit(
        "https://example.invalid/synthetic-work?token=secret",
        [],
        False,
    )
    failed = await _wait_for_status(
        coordinator,
        task.task_id,
        DownloadTaskStatus.FAILED,
    )
    assert failed.message == "合成接口错误"
    assert await coordinator.retry("missing") is None

    service.fail = False
    queued = await coordinator.retry(task.task_id)
    assert queued.status is DownloadTaskStatus.QUEUED
    completed = await _wait_for_status(
        coordinator,
        task.task_id,
        DownloadTaskStatus.COMPLETED,
    )
    assert completed.attempts == 2
    with pytest.raises(TaskStateError, match="只有失败任务"):
        await coordinator.retry(task.task_id)
    await coordinator.close()


async def test_running_task_is_recovered_after_restart(tmp_path) -> None:
    """确保上次退出时执行中的任务会重新排队。

    Args:
        tmp_path: pytest 提供的临时目录。
    """
    repository = SqliteTaskRepository(tmp_path.joinpath("tasks.db"))
    now = datetime.now(UTC)
    task = DownloadTask(
        task_id="recovered-task",
        source_url="https://example.invalid/synthetic-work",
        status=DownloadTaskStatus.RUNNING,
        attempts=1,
        created_at=now,
        updated_at=now,
    )
    await repository.save(task)
    coordinator = DownloadTaskCoordinator(FakeService(), repository, 1)

    await coordinator.start()
    completed = await _wait_for_status(
        coordinator,
        task.task_id,
        DownloadTaskStatus.COMPLETED,
    )

    assert completed.attempts == 2
    await coordinator.close()


async def _wait_for_status(
    coordinator: DownloadTaskCoordinator,
    task_id: str,
    expected: DownloadTaskStatus,
) -> DownloadTask:
    for _ in range(100):
        task = await coordinator.get(task_id)
        if task and task.status is expected:
            return task
        await sleep(0.01)
    raise AssertionError(f"任务未进入预期状态：{expected}")
