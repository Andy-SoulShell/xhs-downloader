"""受管浏览器发布 Worker 的驱动隔离与安全终态测试。"""

import asyncio
from collections.abc import Sequence
from hashlib import sha256
from pathlib import Path

import pytest
from xhs_adapters.filesystem import FilePublicationAssetStore
from xhs_adapters.sqlite import SqlitePublicationTaskRepository
from xhs_core.application import (
    ManagedPublicationWorker,
    PublicationExecutionService,
    PublicationScheduler,
    PublicationTaskService,
)
from xhs_core.domain import (
    BrowserDriver,
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
    """返回固定受管 Chromium 运行状态。"""

    async def status(self) -> ManagedBrowserStatus:
        """返回合成 CDP 运行状态。

        Returns:
            不含本机路径的运行状态。
        """
        return ManagedBrowserStatus(
            installed=True,
            state=ManagedBrowserState.RUNNING,
            executable_name="synthetic-chromium",
            cdp_port=19222,
        )


class _Executor:
    """按固定进度和终态模拟受管发布页面。"""

    def __init__(
        self,
        outcome: ManagedPublicationOutcome | None,
        progresses: Sequence[ManagedPublicationProgress] = (),
        *,
        raises: bool = False,
    ) -> None:
        """保存合成执行脚本。

        Args:
            outcome: 正常返回的结构化终态。
            progresses: 返回终态前依次持久化的进度。
            raises: 是否在进度保存后模拟页面异常。
        """
        self.outcome = outcome
        self.progresses = progresses
        self.raises = raises
        self.tasks: list[PublicationTask] = []
        self.asset_paths: list[tuple[Path, ...]] = []
        self.resume_calls: list[str] = []
        self.close_calls = 0

    async def execute(
        self,
        task: PublicationTask,
        asset_paths: Sequence[Path],
        report: ManagedPublicationProgressReporter,
    ) -> ManagedPublicationOutcome:
        """记录任务并执行合成进度。

        Args:
            task: 已进入填充阶段的任务。
            asset_paths: 经过完整性校验的素材路径。
            report: Worker 提供的原子进度回调。

        Returns:
            构造时提供的终态。

        Raises:
            RuntimeError: 测试要求模拟页面异常。
        """
        self.tasks.append(task)
        self.asset_paths.append(tuple(asset_paths))
        for progress in self.progresses:
            await report(progress)
        if self.raises:
            raise RuntimeError("synthetic executor failure")
        assert self.outcome is not None
        return self.outcome

    async def resume(self, task_id: str) -> bool:
        """记录显式恢复请求。

        Args:
            task_id: 待恢复任务标识。

        Returns:
            固定返回真。
        """
        self.resume_calls.append(task_id)
        return True

    async def close(self) -> None:
        """记录执行器已关闭。"""
        self.close_calls += 1


def _services(tmp_path: Path):
    repository = SqlitePublicationTaskRepository(tmp_path.joinpath("state.db"))
    scheduler = PublicationScheduler(repository)
    assets = FilePublicationAssetStore(tmp_path.joinpath("publication"))
    execution = PublicationExecutionService(
        repository,
        assets,
        scheduler,
        lease_seconds=60,
    )
    return PublicationTaskService(repository, scheduler), execution, assets


async def _submit_managed_task(
    tasks: PublicationTaskService,
    assets: FilePublicationAssetStore,
) -> tuple[PublicationTask, Path]:
    content = b"synthetic-image"
    draft = make_publication_draft().model_copy(deep=True)
    draft.visibility = PublicationVisibility.PRIVATE
    draft.assets[0].size = len(content)
    draft.assets[0].sha256 = sha256(content).hexdigest()
    path = assets.path_for(draft.draft_id, draft.assets[0])
    path.parent.mkdir(parents=True)
    path.write_bytes(content)
    task = await tasks.submit(
        draft,
        PublicationMode.MANUAL,
        None,
        BrowserDriver.MANAGED,
    )
    return task, path


async def _wait_for_status(
    tasks: PublicationTaskService,
    task_id: str,
    expected: PublicationTaskStatus,
) -> PublicationTask:
    for _ in range(100):
        task = await tasks.require(task_id)
        if task.status is expected:
            return task
        await asyncio.sleep(0.01)
    raise AssertionError(f"任务未进入预期状态：{expected.value}")


async def test_worker_claims_only_managed_task_and_persists_success(
    tmp_path: Path,
) -> None:
    """确保 Worker 隔离驱动并只保存页面回读成功的受管任务。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    tasks, execution, assets = _services(tmp_path)
    managed, path = await _submit_managed_task(tasks, assets)
    extension = await tasks.submit(
        managed.package,
        PublicationMode.MANUAL,
        None,
        BrowserDriver.EXTENSION,
    )
    executor = _Executor(
        ManagedPublicationOutcome(
            status=PublicationTaskStatus.PUBLISHED,
            message="创作平台已确认发布成功",
        ),
        [
            ManagedPublicationProgress(
                status=PublicationTaskStatus.PUBLISHING,
                message="即将通过可信输入提交发布",
                publish_attempted=True,
            )
        ],
    )
    worker = ManagedPublicationWorker(
        _Controller(),
        execution,
        executor,
        poll_interval=0.01,
        heartbeat_interval=0.01,
    )

    await worker.start()
    try:
        completed = await _wait_for_status(
            tasks,
            managed.task_id,
            PublicationTaskStatus.PUBLISHED,
        )
    finally:
        await worker.close()

    assert completed.publish_attempted is True
    assert executor.asset_paths == [(path,)]
    assert [task.task_id for task in executor.tasks] == [managed.task_id]
    extension_status = (await tasks.require(extension.task_id)).status
    assert extension_status is PublicationTaskStatus.READY
    assert executor.close_calls == 1


@pytest.mark.parametrize(
    ("progresses", "expected"),
    [
        ([], PublicationTaskStatus.FAILED),
        (
            [
                ManagedPublicationProgress(
                    status=PublicationTaskStatus.PUBLISHING,
                    message="即将点击发布按钮",
                    publish_attempted=True,
                )
            ],
            PublicationTaskStatus.NEEDS_REVIEW,
        ),
    ],
)
async def test_worker_maps_exceptions_by_persisted_publish_attempt(
    tmp_path: Path,
    progresses: list[ManagedPublicationProgress],
    expected: PublicationTaskStatus,
) -> None:
    """确保点击前异常可重试，点击标记后的异常必须人工核对。

    Args:
        tmp_path: Pytest 提供的临时目录。
        progresses: 页面异常前已经持久化的合成进度。
        expected: 预期安全终态。
    """
    tasks, execution, assets = _services(tmp_path)
    task, _ = await _submit_managed_task(tasks, assets)
    executor = _Executor(None, progresses, raises=True)
    worker = ManagedPublicationWorker(
        _Controller(),
        execution,
        executor,
        poll_interval=0.01,
        heartbeat_interval=0.01,
    )

    await worker.start()
    try:
        completed = await _wait_for_status(tasks, task.task_id, expected)
        assert await worker.resume(task.task_id) is True
    finally:
        await worker.close()

    assert completed.publish_attempted is bool(progresses)
    assert executor.resume_calls == [task.task_id]
