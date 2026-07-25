"""共享受管浏览器执行闸门的跨 Worker 测试。"""

import asyncio
from collections.abc import Sequence
from hashlib import sha256
from pathlib import Path

from xhs_adapters.filesystem import FilePublicationAssetStore
from xhs_adapters.sqlite import (
    SqliteBrowserTaskRepository,
    SqlitePublicationTaskRepository,
)
from xhs_core.application import (
    BrowserExecutionService,
    BrowserTaskService,
    ManagedBrowserExecutionGate,
    ManagedBrowserWorker,
    ManagedPublicationWorker,
    PublicationExecutionService,
    PublicationScheduler,
    PublicationTaskService,
)
from xhs_core.domain import (
    BrowserDriver,
    BrowserTask,
    BrowserTaskExecutionResult,
    BrowserTaskKind,
    BrowserTaskStatus,
    ManagedBrowserState,
    ManagedBrowserStatus,
    ManagedPublicationOutcome,
    ManagedPublicationProgress,
    ManagedPublicationProgressReporter,
    PublicationMode,
    PublicationTask,
    PublicationTaskStatus,
    PublicationVisibility,
)

from tests.helpers import make_publication_draft


class _Controller:
    """返回由当前进程持有的运行态浏览器。"""

    def __init__(self, owned: bool = True) -> None:
        """保存浏览器进程归属。

        Args:
            owned: 是否由当前服务进程持有。
        """
        self.owned = owned

    async def status(self) -> ManagedBrowserStatus:
        """返回可执行自动化的合成状态。

        Returns:
            当前进程持有的运行态状态。
        """
        return ManagedBrowserStatus(
            installed=True,
            state=ManagedBrowserState.RUNNING,
            executable_name="synthetic-chromium",
            cdp_port=19222,
            owned_by_current_process=self.owned,
        )


class _BlockingBrowserExecutor:
    """阻塞通用任务以验证发布 Worker 不能并行进入。"""

    def __init__(self) -> None:
        """初始化开始与释放事件。"""
        self.started = asyncio.Event()
        self.release = asyncio.Event()

    async def execute(self, _: BrowserTask) -> BrowserTaskExecutionResult:
        """等待测试释放后返回成功。

        Returns:
            合成读取成功结果。
        """
        self.started.set()
        await self.release.wait()
        return BrowserTaskExecutionResult(
            status=BrowserTaskStatus.SUCCEEDED,
            message="合成读取完成",
            result={
                "items": [],
                "source": "home",
                "keyword": None,
                "has_more": False,
                "cursor": "",
            },
        )

    async def close(self) -> None:
        """释放可能仍在等待的合成任务。"""
        self.release.set()


class _PublicationExecutor:
    """记录发布任务实际进入执行器的时机。"""

    def __init__(self) -> None:
        """初始化进入事件和关闭计数。"""
        self.started = asyncio.Event()
        self.close_calls = 0

    async def execute(
        self,
        _: PublicationTask,
        __: Sequence[Path],
        report: ManagedPublicationProgressReporter,
    ) -> ManagedPublicationOutcome:
        """记录执行并返回严格成功终态。

        Args:
            _: 合成受管发布任务。
            __: 已校验素材路径。
            report: Worker 原子状态回调。

        Returns:
            合成平台确认成功结果。
        """
        self.started.set()
        await report(
            ManagedPublicationProgress(
                status=PublicationTaskStatus.PUBLISHING,
                message="合成发布即将提交",
                publish_attempted=True,
            )
        )
        return ManagedPublicationOutcome(
            status=PublicationTaskStatus.PUBLISHED,
            message="合成平台已确认发布",
        )

    async def resume(self, _: str) -> bool:
        """拒绝无验证等待的恢复请求。

        Returns:
            固定返回假。
        """
        return False

    async def close(self) -> None:
        """记录执行器已经关闭。"""
        self.close_calls += 1


async def _wait_for_publication(
    tasks: PublicationTaskService,
    task_id: str,
) -> PublicationTask:
    for _ in range(100):
        task = await tasks.require(task_id)
        if task.status is PublicationTaskStatus.PUBLISHED:
            return task
        await asyncio.sleep(0.01)
    raise AssertionError("受管发布任务未在限定时间内完成")


async def test_shared_gate_prevents_cross_worker_profile_interference(
    tmp_path: Path,
) -> None:
    """确保通用页面任务结束前发布 Worker 不接触同一 Profile。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    database = tmp_path.joinpath("state.db")
    browser_repository = SqliteBrowserTaskRepository(database)
    browser_tasks = BrowserTaskService(browser_repository)
    browser_execution = BrowserExecutionService(browser_repository, 60)
    browser_task = await browser_tasks.submit(
        BrowserTaskKind.LIST_FEEDS,
        {},
        target_driver=BrowserDriver.MANAGED,
    )

    publication_repository = SqlitePublicationTaskRepository(database)
    scheduler = PublicationScheduler(publication_repository)
    asset_store = FilePublicationAssetStore(tmp_path.joinpath("publication"))
    publication_execution = PublicationExecutionService(
        publication_repository,
        asset_store,
        scheduler,
        60,
    )
    publication_tasks = PublicationTaskService(publication_repository, scheduler)
    content = b"synthetic-image"
    draft = make_publication_draft().model_copy(deep=True)
    draft.visibility = PublicationVisibility.PRIVATE
    draft.assets[0].size = len(content)
    draft.assets[0].sha256 = sha256(content).hexdigest()
    asset_path = asset_store.path_for(draft.draft_id, draft.assets[0])
    asset_path.parent.mkdir(parents=True)
    asset_path.write_bytes(content)
    publication_task = await publication_tasks.submit(
        draft,
        PublicationMode.MANUAL,
        None,
        BrowserDriver.MANAGED,
    )

    gate = ManagedBrowserExecutionGate()
    browser_executor = _BlockingBrowserExecutor()
    publication_executor = _PublicationExecutor()
    controller = _Controller()
    browser_worker = ManagedBrowserWorker(
        controller,
        browser_execution,
        browser_executor,
        gate,
        poll_interval=0.01,
    )
    publication_worker = ManagedPublicationWorker(
        controller,
        publication_execution,
        publication_executor,
        gate,
        poll_interval=0.01,
        heartbeat_interval=0.01,
    )

    await browser_worker.start()
    await asyncio.wait_for(browser_executor.started.wait(), timeout=1)
    await publication_worker.start()
    try:
        await asyncio.sleep(0.03)
        assert publication_executor.started.is_set() is False
        assert (
            await publication_tasks.require(publication_task.task_id)
        ).status is PublicationTaskStatus.READY
        browser_executor.release.set()
        published = await _wait_for_publication(
            publication_tasks,
            publication_task.task_id,
        )
    finally:
        await publication_worker.close()
        await browser_worker.close()

    assert published.publish_attempted is True
    assert (
        await browser_tasks.require(browser_task.task_id)
    ).status is BrowserTaskStatus.SUCCEEDED
    assert publication_executor.close_calls == 1


async def test_worker_does_not_automate_browser_owned_by_other_process(
    tmp_path: Path,
) -> None:
    """确保外部服务持有的 CDP 端口不会被当前 Worker 接管。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    repository = SqliteBrowserTaskRepository(tmp_path.joinpath("state.db"))
    tasks = BrowserTaskService(repository)
    execution = BrowserExecutionService(repository, 60)
    task = await tasks.submit(
        BrowserTaskKind.LIST_FEEDS,
        {},
        target_driver=BrowserDriver.MANAGED,
    )
    executor = _BlockingBrowserExecutor()
    worker = ManagedBrowserWorker(
        _Controller(owned=False),
        execution,
        executor,
        ManagedBrowserExecutionGate(),
        poll_interval=0.01,
    )

    await worker.start()
    try:
        await asyncio.sleep(0.03)
    finally:
        await worker.close()

    assert executor.started.is_set() is False
    assert (await tasks.require(task.task_id)).status is BrowserTaskStatus.QUEUED
