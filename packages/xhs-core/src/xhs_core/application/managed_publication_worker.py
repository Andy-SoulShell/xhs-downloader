"""串行领取并执行受管浏览器专属发布任务。"""

import asyncio
from uuid import uuid4

from loguru import logger

from xhs_core.domain import (
    BrowserDriver,
    ManagedBrowserState,
    ManagedPublicationExecutor,
    ManagedPublicationOutcome,
    ManagedPublicationProgress,
    PublicationClaim,
    PublicationTask,
    PublicationTaskStatus,
)
from xhs_core.domain.browser_ports import ManagedBrowserController

from .publication_execution import PublicationExecutionService


class ManagedPublicationWorker:
    """在受管 Chromium 运行期间串行执行其专属发布任务。

    Worker 在可信发布点击前持久化不可逆安全标记，并在长时间上传、视频
    处理或用户验证期间持续续租。执行异常只按持久化标记决定是否需要
    人工核对，不会跨驱动重试。

    Args:
        controller: 共享独立 Profile 的受管 Chromium 控制器。
        execution: 发布租约、素材和状态机用例。
        executor: 保持同一页面完成发布与验证恢复的执行器。
        poll_interval: 浏览器停止或队列为空时的轮询秒数。
        heartbeat_interval: 发布执行期间的续租秒数。
        worker_id: 可选稳定执行器标识。

    Raises:
        ValueError: 轮询或续租间隔不在合理范围内。
    """

    def __init__(
        self,
        controller: ManagedBrowserController,
        execution: PublicationExecutionService,
        executor: ManagedPublicationExecutor,
        poll_interval: float = 0.5,
        heartbeat_interval: float = 15,
        worker_id: str | None = None,
    ) -> None:
        if not 0 < poll_interval <= 5:
            raise ValueError("受管发布轮询间隔必须大于零且不超过五秒")
        if not 0 < heartbeat_interval <= 30:
            raise ValueError("受管发布续租间隔必须大于零且不超过三十秒")
        self._controller = controller
        self._execution = execution
        self._executor = executor
        self._poll_interval = poll_interval
        self._heartbeat_interval = heartbeat_interval
        self._worker_id = worker_id or f"managed-publication-{uuid4().hex}"
        self._lifecycle_lock = asyncio.Lock()
        self._runner: asyncio.Task[None] | None = None
        self._closed = False

    async def start(self) -> None:
        """幂等启动受管发布任务轮询。

        Raises:
            RuntimeError: Worker 已经关闭。
        """
        async with self._lifecycle_lock:
            if self._closed:
                raise RuntimeError("受管发布 Worker 已关闭")
            if self._runner and not self._runner.done():
                return
            self._runner = asyncio.create_task(
                self._run(),
                name="managed-publication-worker",
            )

    async def close(self) -> None:
        """幂等取消轮询和当前发布，并关闭页面执行器。"""
        async with self._lifecycle_lock:
            if self._closed:
                return
            runner = self._runner
            self._runner = None
            if runner:
                runner.cancel()
                await asyncio.gather(runner, return_exceptions=True)
            await self._executor.close()
            self._closed = True

    async def resume(self, task_id: str) -> bool:
        """恢复同一页面中等待用户验证的发布任务。

        Args:
            task_id: 用户已完成验证的任务标识。

        Returns:
            当前执行器正在等待该任务时返回真。
        """
        if self._closed:
            return False
        return await self._executor.resume(task_id)

    async def _run(self) -> None:
        while True:
            try:
                status = await self._controller.status()
                if status.state is not ManagedBrowserState.RUNNING:
                    await asyncio.sleep(self._poll_interval)
                    continue
                claim = await self._execution.claim(
                    self._worker_id,
                    target_driver=BrowserDriver.MANAGED,
                )
                if claim is None:
                    await asyncio.sleep(self._poll_interval)
                    continue
                await self._execute(claim)
            except asyncio.CancelledError:
                raise
            except Exception as error:
                logger.error(
                    "受管发布 Worker 轮询失败：{}",
                    type(error).__name__,
                )
                await asyncio.sleep(self._poll_interval)

    async def _execute(self, claim: PublicationClaim) -> None:
        current: PublicationTask | None = None
        heartbeat: asyncio.Task[None] | None = None
        progress_lock = asyncio.Lock()

        async def report(progress: ManagedPublicationProgress) -> None:
            nonlocal current
            async with progress_lock:
                current = await self._execution.update_status(
                    claim.task.task_id,
                    claim.lease_token,
                    progress.status,
                    progress.message,
                    publish_attempted=progress.publish_attempted,
                )

        async def renew_lease() -> None:
            nonlocal current
            while True:
                await asyncio.sleep(self._heartbeat_interval)
                async with progress_lock:
                    if current is None:
                        continue
                    current = await self._execution.update_status(
                        current.task_id,
                        claim.lease_token,
                        current.status,
                        current.message,
                        publish_attempted=current.publish_attempted,
                    )

        try:
            current = await self._execution.update_status(
                claim.task.task_id,
                claim.lease_token,
                PublicationTaskStatus.FILLING,
                "受管浏览器正在准备发布素材",
            )
            paths = await self._execution.asset_paths(
                current.task_id,
                claim.lease_token,
            )
            heartbeat = asyncio.create_task(renew_lease())
            outcome = await self._executor.execute(current, paths, report)
            await _cancel_task(heartbeat)
            heartbeat = None
            await self._finish(claim, outcome)
        except asyncio.CancelledError:
            await _cancel_task(heartbeat)
            if current:
                await self._finish_interrupted(claim, True)
            raise
        except Exception as error:
            await _cancel_task(heartbeat)
            logger.error("受管发布执行失败：{}", type(error).__name__)
            if current:
                await self._finish_interrupted(claim, False)

    async def _finish(
        self,
        claim: PublicationClaim,
        outcome: ManagedPublicationOutcome,
    ) -> None:
        await self._execution.update_status(
            claim.task.task_id,
            claim.lease_token,
            outcome.status,
            outcome.message,
            outcome.result_url,
        )

    async def _finish_interrupted(
        self,
        claim: PublicationClaim,
        stopped: bool,
    ) -> None:
        try:
            latest = await self._execution.require(claim.task.task_id)
            attempted = latest.publish_attempted
            status = (
                PublicationTaskStatus.NEEDS_REVIEW
                if attempted
                else PublicationTaskStatus.FAILED
            )
            if attempted:
                message = "受管浏览器停止，发布结果需要人工核对"
                if not stopped:
                    message = "发布点击后执行中断，结果需要人工核对"
            else:
                message = "受管浏览器停止，发布尚未提交，可以安全重试"
                if not stopped:
                    message = "发布点击前执行失败，可以安全重试"
            await self._execution.update_status(
                latest.task_id,
                claim.lease_token,
                status,
                message,
            )
        except Exception as error:
            logger.error(
                "受管发布中断状态保存失败：{}",
                type(error).__name__,
            )


async def _cancel_task(task: asyncio.Task[None] | None) -> None:
    if not task:
        return
    task.cancel()
    await asyncio.gather(task, return_exceptions=True)
