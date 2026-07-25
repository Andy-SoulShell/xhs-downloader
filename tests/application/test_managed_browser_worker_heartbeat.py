"""受管浏览器通用任务续租测试。"""

import asyncio
from pathlib import Path

from aiosqlite import connect
from xhs_adapters.sqlite import SqliteBrowserTaskRepository
from xhs_core.application import (
    BrowserExecutionService,
    BrowserTaskService,
    ManagedBrowserExecutionGate,
    ManagedBrowserWorker,
)
from xhs_core.domain import (
    BrowserDriver,
    BrowserTask,
    BrowserTaskExecutionResult,
    BrowserTaskKind,
    BrowserTaskLeaseConflictError,
    BrowserTaskStatus,
    ManagedBrowserState,
    ManagedBrowserStatus,
)


class _RunningController:
    """返回当前进程拥有的运行态受管浏览器。"""

    async def status(self) -> ManagedBrowserStatus:
        """返回合成运行状态。"""
        return ManagedBrowserStatus(
            installed=True,
            state=ManagedBrowserState.RUNNING,
            executable_name="Synthetic Chromium",
            cdp_port=9222,
            owned_by_current_process=True,
        )


class _SlowExecutor:
    """记录执行次数并支持延迟或永久等待。"""

    def __init__(self, delay: float | None) -> None:
        self.delay = delay
        self.started = asyncio.Event()
        self.cancelled = asyncio.Event()
        self.execute_calls = 0
        self.close_calls = 0

    async def execute(self, task: BrowserTask) -> BrowserTaskExecutionResult:
        """执行一次合成页面动作。"""
        self.execute_calls += 1
        self.started.set()
        try:
            if self.delay is None:
                await asyncio.Event().wait()
            else:
                await asyncio.sleep(self.delay)
        except asyncio.CancelledError:
            self.cancelled.set()
            raise
        return BrowserTaskExecutionResult(
            status=BrowserTaskStatus.SUCCEEDED,
            message="登录状态已读取",
            result={"logged_in": False, "user_id": None, "nickname": None},
        )

    async def close(self) -> None:
        """记录执行器关闭。"""
        self.close_calls += 1


class _RecordingExecution:
    """代理真实租约服务并记录运行态续租。"""

    def __init__(
        self,
        delegate: BrowserExecutionService,
        database: Path,
        *,
        invalidate_first_heartbeat: bool = False,
    ) -> None:
        self._delegate = delegate
        self._database = database
        self._invalidate_first_heartbeat = invalidate_first_heartbeat
        self.running_updates = 0

    async def claim(
        self,
        executor_id: str,
        target_driver: BrowserDriver,
    ):
        """代理任务领取。"""
        return await self._delegate.claim(executor_id, target_driver)

    async def update(
        self,
        task_id: str,
        lease_token: str,
        status: BrowserTaskStatus,
        message: str,
        result=None,
    ) -> BrowserTask:
        """记录运行态更新，并可模拟心跳时租约已被撤销。"""
        if status is BrowserTaskStatus.RUNNING:
            self.running_updates += 1
            if self._invalidate_first_heartbeat and self.running_updates == 2:
                async with connect(self._database) as database:
                    await database.execute(
                        """
                        UPDATE browser_task SET lease_hash = ?
                        WHERE task_id = ?
                        """,
                        ("synthetic-stale-lease", task_id),
                    )
                    await database.commit()
                raise BrowserTaskLeaseConflictError("浏览器任务租约无效或已经过期")
        return await self._delegate.update(
            task_id,
            lease_token,
            status,
            message,
            result,
        )


def _services(
    path: Path,
    *,
    invalidate_first_heartbeat: bool = False,
) -> tuple[BrowserTaskService, _RecordingExecution]:
    database = path.joinpath("state.db")
    repository = SqliteBrowserTaskRepository(database)
    execution = BrowserExecutionService(repository, lease_seconds=0.09)
    return (
        BrowserTaskService(repository),
        _RecordingExecution(
            execution,
            database,
            invalidate_first_heartbeat=invalidate_first_heartbeat,
        ),
    )


async def _wait_for_status(
    tasks: BrowserTaskService,
    task_id: str,
    expected: BrowserTaskStatus,
) -> BrowserTask:
    for _ in range(300):
        task = await tasks.require(task_id)
        if task.status is expected:
            return task
        await asyncio.sleep(0.01)
    raise AssertionError(f"任务未进入预期状态：{expected.value}")


async def _wait_for_heartbeats(
    execution: _RecordingExecution,
    minimum: int,
) -> None:
    for _ in range(200):
        if execution.running_updates >= minimum:
            return
        await asyncio.sleep(0.005)
    raise AssertionError("受管浏览器任务未按期续租")


def _worker(
    execution: _RecordingExecution,
    executor: _SlowExecutor,
) -> ManagedBrowserWorker:
    return ManagedBrowserWorker(
        _RunningController(),
        execution,  # type: ignore[arg-type]
        executor,
        ManagedBrowserExecutionGate(),
        poll_interval=0.005,
    )


async def test_slow_managed_task_keeps_lease_until_success(tmp_path: Path) -> None:
    """短租约任务执行超过期限时仍可通过多次心跳成功完成。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    tasks, execution = _services(tmp_path)
    executor = _SlowExecutor(delay=0.24)
    task = await tasks.submit(
        BrowserTaskKind.CHECK_LOGIN_STATUS,
        {},
        target_driver=BrowserDriver.MANAGED,
    )
    worker = _worker(execution, executor)

    await worker.start()
    try:
        completed = await _wait_for_status(
            tasks,
            task.task_id,
            BrowserTaskStatus.SUCCEEDED,
        )
        updates_at_completion = execution.running_updates
        await asyncio.sleep(0.12)
    finally:
        await worker.close()

    assert completed.result == {
        "logged_in": False,
        "user_id": None,
        "nickname": None,
    }
    assert updates_at_completion >= 4
    assert execution.running_updates == updates_at_completion
    assert executor.execute_calls == 1


async def test_worker_close_stops_heartbeat_and_inflight_write(tmp_path: Path) -> None:
    """关闭 Worker 时同时取消页面动作与心跳，并将写任务置为待核对。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    tasks, execution = _services(tmp_path)
    executor = _SlowExecutor(delay=None)
    task = await tasks.submit(
        BrowserTaskKind.SET_FAVORITE,
        {
            "feed_id": "synthetic-feed",
            "xsec_token": "synthetic-token",
            "active": True,
        },
        target_driver=BrowserDriver.MANAGED,
    )
    worker = _worker(execution, executor)

    await worker.start()
    await asyncio.wait_for(executor.started.wait(), timeout=1)
    await _wait_for_heartbeats(execution, 2)
    await worker.close()
    updates_at_close = execution.running_updates
    await asyncio.sleep(0.12)
    reviewed = await tasks.require(task.task_id)

    assert reviewed.status is BrowserTaskStatus.NEEDS_REVIEW
    assert executor.cancelled.is_set()
    assert execution.running_updates == updates_at_close
    assert executor.execute_calls == 1
    assert executor.close_calls == 1


async def test_stale_heartbeat_cancels_action_and_recovers_safely(
    tmp_path: Path,
) -> None:
    """心跳发现陈旧租约时取消在途写操作，过期恢复后要求人工核对。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    tasks, execution = _services(tmp_path, invalidate_first_heartbeat=True)
    executor = _SlowExecutor(delay=None)
    task = await tasks.submit(
        BrowserTaskKind.SET_LIKE,
        {
            "feed_id": "synthetic-feed",
            "xsec_token": "synthetic-token",
            "active": True,
        },
        target_driver=BrowserDriver.MANAGED,
    )
    worker = _worker(execution, executor)

    await worker.start()
    try:
        reviewed = await _wait_for_status(
            tasks,
            task.task_id,
            BrowserTaskStatus.NEEDS_REVIEW,
        )
    finally:
        await worker.close()

    assert "人工核对" in reviewed.message
    assert executor.cancelled.is_set()
    assert executor.execute_calls == 1
    assert execution.running_updates == 2
