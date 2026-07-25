"""通过 Playwright 在同一受管创作页安全执行发布任务。"""

import asyncio
from collections.abc import Sequence
from pathlib import Path

from xhs_core.domain import (
    ManagedBrowserError,
    ManagedPublicationOutcome,
    ManagedPublicationProgressReporter,
    PublicationTask,
    PublicationTaskStatus,
)
from xhs_core.domain.browser_ports import ManagedBrowserController

from .managed_page_session import ManagedPageSessionFactory, PlaywrightCdpSession
from .managed_publication_assets import validate_publication_asset_paths
from .managed_publication_contract import validate_publication_task
from .managed_publication_flow import (
    _ActiveExecution,
    _ManagedPublicationFlow,
)


class PlaywrightManagedPublicationExecutor:
    """在专用 Profile 的单一页面内执行并核验一项受管发布。

    Args:
        controller: 提供当前受管 Chromium CDP 端点的控制器。
        session_factory: 创建仅断开自动化连接的短生命周期会话。
        observation_timeout: 发布点击后单轮等待平台终态的秒数。
        poll_interval: 发布结果页面轮询间隔秒数。

    Raises:
        ValueError: 观察时间或轮询间隔不在合理范围内。
    """

    def __init__(
        self,
        controller: ManagedBrowserController,
        session_factory: ManagedPageSessionFactory = PlaywrightCdpSession,
        *,
        observation_timeout: float = 120,
        poll_interval: float = 0.5,
    ) -> None:
        if not 0 < observation_timeout <= 600:
            raise ValueError("发布结果等待时间必须大于零且不超过十分钟")
        if not 0 < poll_interval <= 5:
            raise ValueError("发布结果轮询间隔必须大于零且不超过五秒")
        self._flow = _ManagedPublicationFlow(
            controller,
            session_factory,
            observation_timeout=observation_timeout,
            poll_interval=poll_interval,
            is_closed=lambda: self._closed,
        )
        self._lock = asyncio.Lock()
        self._active: _ActiveExecution | None = None
        self._closed = False

    async def execute(
        self,
        task: PublicationTask,
        asset_paths: Sequence[Path],
        report: ManagedPublicationProgressReporter,
    ) -> ManagedPublicationOutcome:
        """执行一次不会跨驱动重试的受管发布。

        Args:
            task: 已进入填充阶段且尚未尝试发布的受管任务。
            asset_paths: 按素材位置排序并由 Worker 校验过的绝对路径。
            report: 发布点击或暂停前必须完成的原子状态回调。

        Returns:
            明确发布、明确失败或需要人工核对的安全终态。

        Raises:
            ManagedBrowserError: 执行器已关闭或已有另一任务运行。
        """
        active = await self._begin(task.task_id)
        try:
            try:
                media_kind = validate_publication_task(task)
                paths = validate_publication_asset_paths(task, asset_paths)
                return await self._flow._run(
                    active,
                    task,
                    paths,
                    media_kind,
                    report,
                )
            except asyncio.CancelledError:
                raise
            except Exception:
                return _interrupted_outcome(active.publish_attempted)
        finally:
            try:
                await self._flow._cleanup(active)
            finally:
                await self._finish(active)

    async def resume(self, task_id: str) -> bool:
        """恢复当前同一页面中等待用户完成验证的任务。

        Args:
            task_id: 用户已经处理验证的发布任务标识。

        Returns:
            仅在对应任务当前确实等待验证时返回真。
        """
        async with self._lock:
            active = self._active
            if (
                self._closed
                or active is None
                or active.task_id != task_id
                or not active.waiting
                or active.resume_event.is_set()
            ):
                return False
            active.resume_event.set()
            return True

    async def close(self) -> None:
        """取消当前执行或验证等待并断开 Playwright 会话。"""
        async with self._lock:
            if self._closed:
                return
            self._closed = True
            active = self._active
            if active:
                active.resume_event.set()
            runner = active.runner if active else None
        if runner and runner is not asyncio.current_task():
            runner.cancel()
            await asyncio.gather(runner, return_exceptions=True)

    async def _begin(self, task_id: str) -> _ActiveExecution:
        runner = asyncio.current_task()
        if runner is None:
            raise ManagedBrowserError("无法识别受管发布执行任务")
        async with self._lock:
            if self._closed:
                raise ManagedBrowserError("受管发布页面执行器已经关闭")
            if self._active is not None:
                raise ManagedBrowserError("已有受管发布任务正在执行")
            active = _ActiveExecution(task_id=task_id, runner=runner)
            self._active = active
            return active

    async def _finish(self, active: _ActiveExecution) -> None:
        async with self._lock:
            if self._active is active:
                self._active = None


def _interrupted_outcome(attempted: bool) -> ManagedPublicationOutcome:
    return ManagedPublicationOutcome(
        status=(
            PublicationTaskStatus.NEEDS_REVIEW
            if attempted
            else PublicationTaskStatus.FAILED
        ),
        message=(
            "发布点击后结果未能确认，需要人工核对"
            if attempted
            else "受管浏览器发布点击前执行失败，可以安全重试"
        ),
    )
