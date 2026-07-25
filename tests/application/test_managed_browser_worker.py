"""受管浏览器任务 Worker 应用测试。"""

import asyncio

import pytest
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
    BrowserTaskStatus,
    ManagedBrowserState,
    ManagedBrowserStatus,
)


class _Controller:
    def __init__(self, state: ManagedBrowserState) -> None:
        self.state = state
        self.status_failures = 0

    async def status(self) -> ManagedBrowserStatus:
        if self.status_failures:
            self.status_failures -= 1
            raise RuntimeError("synthetic controller failure")
        return ManagedBrowserStatus(
            installed=True,
            state=self.state,
            executable_name="Synthetic Chromium",
            cdp_port=9222 if self.state is ManagedBrowserState.RUNNING else None,
            owned_by_current_process=True,
        )


class _Executor:
    def __init__(
        self,
        outcome: BrowserTaskExecutionResult | None = None,
        *,
        raises: bool = False,
        blocks: bool = False,
    ) -> None:
        self.outcome = outcome
        self.raises = raises
        self.blocks = blocks
        self.tasks: list[BrowserTask] = []
        self.started = asyncio.Event()
        self.close_calls = 0

    async def execute(self, task: BrowserTask) -> BrowserTaskExecutionResult:
        self.tasks.append(task)
        self.started.set()
        if self.blocks:
            await asyncio.Event().wait()
        if self.raises:
            raise RuntimeError("synthetic executor failure")
        assert self.outcome is not None
        return self.outcome

    async def close(self) -> None:
        self.close_calls += 1


def _services(tmp_path):
    repository = SqliteBrowserTaskRepository(tmp_path.joinpath("state.db"))
    return (
        BrowserTaskService(repository),
        BrowserExecutionService(repository, lease_seconds=60),
    )


async def _wait_for_status(
    tasks: BrowserTaskService,
    task_id: str,
    expected: BrowserTaskStatus,
) -> BrowserTask:
    for _ in range(100):
        task = await tasks.require(task_id)
        if task.status is expected:
            return task
        await asyncio.sleep(0.01)
    raise AssertionError(f"任务未进入预期状态：{expected.value}")


async def test_worker_only_claims_managed_tasks_while_browser_runs(tmp_path) -> None:
    """确保停止态不领取任务，运行后也不会抢占扩展队列。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    tasks, execution = _services(tmp_path)
    controller = _Controller(ManagedBrowserState.STOPPED)
    executor = _Executor(
        BrowserTaskExecutionResult(
            status=BrowserTaskStatus.SUCCEEDED,
            message="登录状态已读取",
            result={"logged_in": False, "user_id": None, "nickname": None},
        )
    )
    extension = await tasks.submit(BrowserTaskKind.CHECK_LOGIN_STATUS, {})
    managed = await tasks.submit(
        BrowserTaskKind.CHECK_LOGIN_STATUS,
        {},
        target_driver=BrowserDriver.MANAGED,
    )
    worker = ManagedBrowserWorker(
        controller,
        execution,
        executor,
        ManagedBrowserExecutionGate(),
        poll_interval=0.01,
    )

    await worker.start()
    try:
        await asyncio.sleep(0.03)
        assert (await tasks.require(managed.task_id)).status is BrowserTaskStatus.QUEUED
        controller.state = ManagedBrowserState.RUNNING
        completed = await _wait_for_status(
            tasks,
            managed.task_id,
            BrowserTaskStatus.SUCCEEDED,
        )
    finally:
        await worker.close()

    assert [task.task_id for task in executor.tasks] == [managed.task_id]
    assert completed.target_driver is BrowserDriver.MANAGED
    assert (await tasks.require(extension.task_id)).status is BrowserTaskStatus.QUEUED


async def test_worker_maps_executor_exceptions_by_effect_safety(tmp_path) -> None:
    """确保读取异常明确失败，可能写入的异常要求人工核对。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    tasks, execution = _services(tmp_path)
    controller = _Controller(ManagedBrowserState.RUNNING)
    controller.status_failures = 1
    executor = _Executor(raises=True)
    read_task = await tasks.submit(
        BrowserTaskKind.LIST_FEEDS,
        {},
        target_driver=BrowserDriver.MANAGED,
    )
    write_task = await tasks.submit(
        BrowserTaskKind.SET_LIKE,
        {
            "feed_id": "synthetic-feed",
            "xsec_token": "synthetic-token",
            "active": True,
        },
        target_driver=BrowserDriver.MANAGED,
    )
    worker = ManagedBrowserWorker(
        controller,
        execution,
        executor,
        ManagedBrowserExecutionGate(),
        poll_interval=0.01,
    )

    await worker.start()
    try:
        failed = await _wait_for_status(
            tasks,
            read_task.task_id,
            BrowserTaskStatus.FAILED,
        )
        reviewed = await _wait_for_status(
            tasks,
            write_task.task_id,
            BrowserTaskStatus.NEEDS_REVIEW,
        )
    finally:
        await worker.close()

    assert "安全重试" in failed.message
    assert "人工核对" in reviewed.message
    assert len(executor.tasks) == 2


async def test_worker_preserves_executor_confirmed_failure(tmp_path) -> None:
    """确保执行器确认未产生写入时可返回明确失败。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    tasks, execution = _services(tmp_path)
    controller = _Controller(ManagedBrowserState.RUNNING)
    executor = _Executor(
        BrowserTaskExecutionResult(
            status=BrowserTaskStatus.FAILED,
            message="目标控件不存在，未执行写入",
            result={
                "adapter_version": "xhs-web-2026.07",
                "selector_profile": "semantic-dom-v1",
                "page_kind": "feed_detail",
                "matched_anchors": ["main_container"],
                "missing_anchors": ["detail_container"],
            },
        )
    )
    task = await tasks.submit(
        BrowserTaskKind.SET_FAVORITE,
        {
            "feed_id": "synthetic-feed",
            "xsec_token": "synthetic-token",
            "active": True,
        },
        target_driver=BrowserDriver.MANAGED,
    )
    worker = ManagedBrowserWorker(
        controller,
        execution,
        executor,
        ManagedBrowserExecutionGate(),
        poll_interval=0.01,
    )

    await worker.start()
    try:
        failed = await _wait_for_status(
            tasks,
            task.task_id,
            BrowserTaskStatus.FAILED,
        )
    finally:
        await worker.close()

    assert failed.message == "浏览器任务执行失败，可安全重试"
    assert failed.result == {
        "adapter_version": "xhs-web-2026.07",
        "selector_profile": "semantic-dom-v1",
        "page_kind": "feed_detail",
        "matched_anchors": ["main_container"],
        "missing_anchors": ["detail_container"],
    }


async def test_worker_start_and_close_are_idempotent_and_cancel_execution(
    tmp_path,
) -> None:
    """确保重复启动不生成并行消费者，关闭可取消在途写任务。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    tasks, execution = _services(tmp_path)
    controller = _Controller(ManagedBrowserState.RUNNING)
    executor = _Executor(blocks=True)
    task = await tasks.submit(
        BrowserTaskKind.SET_FAVORITE,
        {
            "feed_id": "synthetic-feed",
            "xsec_token": "synthetic-token",
            "active": True,
        },
        target_driver=BrowserDriver.MANAGED,
    )
    worker = ManagedBrowserWorker(
        controller,
        execution,
        executor,
        ManagedBrowserExecutionGate(),
        poll_interval=0.01,
    )

    await worker.start()
    await worker.start()
    await asyncio.wait_for(executor.started.wait(), timeout=1)
    await worker.close()
    await worker.close()
    reviewed = await tasks.require(task.task_id)

    assert reviewed.status is BrowserTaskStatus.NEEDS_REVIEW
    assert len(executor.tasks) == 1
    assert executor.close_calls == 1
    with pytest.raises(RuntimeError, match="已关闭"):
        await worker.start()
    with pytest.raises(ValueError, match="轮询间隔"):
        ManagedBrowserWorker(
            controller,
            execution,
            executor,
            ManagedBrowserExecutionGate(),
            poll_interval=0,
        )
