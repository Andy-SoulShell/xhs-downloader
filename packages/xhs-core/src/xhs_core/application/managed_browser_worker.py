"""受管浏览器任务后台 Worker。"""

import asyncio
from uuid import uuid4

from loguru import logger

from xhs_core.domain import (
    BrowserDriver,
    BrowserTask,
    BrowserTaskClaim,
    BrowserTaskStatus,
    ManagedBrowserState,
    browser_task_may_write_platform,
)
from xhs_core.domain.browser_ports import BrowserTaskExecutor, ManagedBrowserController

from .browser_execution import BrowserExecutionService


class ManagedBrowserWorker:
    """在受管 Chromium 运行期间串行执行其专属任务。

    Worker 不负责启动或停止 Chromium，只观察控制器状态。领取后的任务
    会先进入运行态；执行中断时，读取任务明确失败，可能改变平台状态的
    任务转为人工核对，避免产生不可控的重复写入。

    Args:
        controller: 受管浏览器生命周期控制器。
        execution: 浏览器任务租约与状态服务。
        executor: 已连接受管页面的任务执行器。
        poll_interval: 空闲或浏览器未运行时的轮询间隔秒数。
        worker_id: 可选稳定实例标识，默认生成进程内唯一标识。

    Raises:
        ValueError: 轮询间隔不在合理范围内。
    """

    def __init__(
        self,
        controller: ManagedBrowserController,
        execution: BrowserExecutionService,
        executor: BrowserTaskExecutor,
        poll_interval: float = 0.25,
        worker_id: str | None = None,
    ) -> None:
        if not 0 < poll_interval <= 5:
            raise ValueError("受管浏览器任务轮询间隔必须大于零且不超过五秒")
        self._controller = controller
        self._execution = execution
        self._executor = executor
        self._poll_interval = poll_interval
        self._worker_id = worker_id or f"managed-{uuid4().hex}"
        self._lifecycle_lock = asyncio.Lock()
        self._runner: asyncio.Task[None] | None = None
        self._closed = False

    async def start(self) -> None:
        """幂等启动后台轮询。

        Raises:
            RuntimeError: Worker 已经关闭，不能再次启动。
        """
        async with self._lifecycle_lock:
            if self._closed:
                raise RuntimeError("受管浏览器任务 Worker 已关闭")
            if self._runner and not self._runner.done():
                return
            self._runner = asyncio.create_task(
                self._run(),
                name="managed-browser-worker",
            )

    async def close(self) -> None:
        """幂等取消轮询和当前任务，并关闭页面执行器。"""
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

    async def _run(self) -> None:
        while True:
            try:
                status = await self._controller.status()
                if status.state is not ManagedBrowserState.RUNNING:
                    await asyncio.sleep(self._poll_interval)
                    continue
                claim = await self._execution.claim(
                    self._worker_id,
                    BrowserDriver.MANAGED,
                )
                if claim is None:
                    await asyncio.sleep(self._poll_interval)
                    continue
                await self._execute(claim)
            except asyncio.CancelledError:
                raise
            except Exception as error:
                logger.error(
                    "受管浏览器 Worker 轮询失败：{}",
                    type(error).__name__,
                )
                await asyncio.sleep(self._poll_interval)

    async def _execute(self, claim: BrowserTaskClaim) -> None:
        running: BrowserTask | None = None
        try:
            running = await self._execution.update(
                claim.task.task_id,
                claim.lease_token,
                BrowserTaskStatus.RUNNING,
                "受管浏览器正在执行",
            )
            outcome = await self._executor.execute(running)
            await self._execution.update(
                running.task_id,
                claim.lease_token,
                outcome.status,
                outcome.message,
                outcome.result,
            )
        except asyncio.CancelledError:
            if running:
                await self._finish_interrupted(running, claim.lease_token, True)
            raise
        except Exception as error:
            logger.error(
                "受管浏览器任务 {} 执行失败：{}",
                claim.task.task_id,
                type(error).__name__,
            )
            if running:
                await self._finish_interrupted(running, claim.lease_token, False)

    async def _finish_interrupted(
        self,
        task: BrowserTask,
        lease_token: str,
        stopped: bool,
    ) -> None:
        may_write = browser_task_may_write_platform(task.kind)
        status = (
            BrowserTaskStatus.NEEDS_REVIEW if may_write else BrowserTaskStatus.FAILED
        )
        if may_write:
            message = "受管浏览器停止，写入结果未能确认，请人工核对"
            if not stopped:
                message = "受管浏览器写入结果未能确认，请人工核对"
        else:
            message = "受管浏览器停止，读取任务已中断"
            if not stopped:
                message = "受管浏览器读取任务执行失败，可安全重试"
        try:
            await self._execution.update(
                task.task_id,
                lease_token,
                status,
                message,
            )
        except Exception as error:
            logger.error(
                "受管浏览器任务 {} 终态回传失败：{}",
                task.task_id,
                type(error).__name__,
            )
