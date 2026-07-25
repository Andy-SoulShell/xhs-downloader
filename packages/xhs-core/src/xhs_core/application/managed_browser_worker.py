"""受管浏览器任务后台 Worker。"""

import asyncio
from uuid import uuid4

from loguru import logger

from xhs_core.domain import (
    BrowserDriver,
    BrowserTask,
    BrowserTaskClaim,
    BrowserTaskExecutionResult,
    BrowserTaskLeaseConflictError,
    BrowserTaskStatus,
    ManagedBrowserState,
    browser_task_may_write_platform,
)
from xhs_core.domain.browser_ports import BrowserTaskExecutor, ManagedBrowserController

from .browser_execution import BrowserExecutionService
from .managed_browser_gate import ManagedBrowserExecutionGate

_MAX_HEARTBEAT_INTERVAL_SECONDS = 15


class ManagedBrowserWorker:
    """在受管 Chromium 运行期间串行执行其专属任务。

    Worker 不负责启动或停止 Chromium，只观察控制器状态。领取后的任务
    会先进入运行态并按服务端租约周期续租；续租失效会取消在途执行。
    执行中断时，读取任务明确失败，可能改变平台状态的任务转为人工
    核对，避免产生不可控的重复写入。

    Args:
        controller: 受管浏览器生命周期控制器。
        execution: 浏览器任务租约与状态服务。
        executor: 已连接受管页面的任务执行器。
        execution_gate: 与其他受管 Worker 共享的独占执行闸门。
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
        execution_gate: ManagedBrowserExecutionGate,
        poll_interval: float = 0.25,
        worker_id: str | None = None,
    ) -> None:
        if not 0 < poll_interval <= 5:
            raise ValueError("受管浏览器任务轮询间隔必须大于零且不超过五秒")
        self._controller = controller
        self._execution = execution
        self._executor = executor
        self._execution_gate = execution_gate
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
                if not await self._run_once():
                    await asyncio.sleep(self._poll_interval)
            except asyncio.CancelledError:
                raise
            except Exception as error:
                logger.error(
                    "受管浏览器 Worker 轮询失败：{}",
                    type(error).__name__,
                )
                await asyncio.sleep(self._poll_interval)

    async def _run_once(self) -> bool:
        async with self._execution_gate.hold():
            status = await self._controller.status()
            if (
                status.state is not ManagedBrowserState.RUNNING
                or not status.owned_by_current_process
            ):
                return False
            claim = await self._execution.claim(
                self._worker_id,
                BrowserDriver.MANAGED,
            )
            if claim is None:
                return False
            await self._execute(claim)
            return True

    async def _execute(self, claim: BrowserTaskClaim) -> None:
        running: BrowserTask | None = None
        execution_task: asyncio.Task[BrowserTaskExecutionResult] | None = None
        heartbeat_task: asyncio.Task[None] | None = None
        try:
            running = await self._execution.update(
                claim.task.task_id,
                claim.lease_token,
                BrowserTaskStatus.RUNNING,
                "受管浏览器正在执行",
            )
            execution_task = asyncio.create_task(self._executor.execute(running))
            heartbeat_task = asyncio.create_task(
                self._renew_lease(claim),
                name=f"managed-browser-heartbeat-{running.task_id}",
            )
            completed, _ = await asyncio.wait(
                {execution_task, heartbeat_task},
                return_when=asyncio.FIRST_COMPLETED,
            )
            if heartbeat_task in completed:
                error = heartbeat_task.exception()
                if error is None:
                    raise RuntimeError("受管浏览器任务续租意外停止")
                raise error
            outcome = execution_task.result()
            await _cancel_task(heartbeat_task)
            heartbeat_task = None
            await self._execution.update(
                running.task_id,
                claim.lease_token,
                outcome.status,
                outcome.message,
                outcome.result,
            )
        except asyncio.CancelledError:
            await _cancel_task(execution_task)
            await _cancel_task(heartbeat_task)
            if running:
                await self._finish_interrupted(running, claim.lease_token, True)
            raise
        except BrowserTaskLeaseConflictError:
            await _cancel_task(execution_task)
            await _cancel_task(heartbeat_task)
            logger.warning(
                "受管浏览器任务 {} 租约已经失效，停止当前页面执行",
                claim.task.task_id,
            )
        except Exception as error:
            await _cancel_task(execution_task)
            await _cancel_task(heartbeat_task)
            logger.error(
                "受管浏览器任务 {} 执行失败：{}",
                claim.task.task_id,
                type(error).__name__,
            )
            if running:
                await self._finish_interrupted(running, claim.lease_token, False)

    async def _renew_lease(self, claim: BrowserTaskClaim) -> None:
        interval = min(
            _MAX_HEARTBEAT_INTERVAL_SECONDS,
            claim.lease_seconds / 3,
        )
        while True:
            await asyncio.sleep(interval)
            async with asyncio.timeout(interval):
                await self._execution.update(
                    claim.task.task_id,
                    claim.lease_token,
                    BrowserTaskStatus.RUNNING,
                    "受管浏览器正在执行",
                )

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


async def _cancel_task[TaskResult](
    task: asyncio.Task[TaskResult] | None,
) -> None:
    if task is None:
        return
    if not task.done():
        task.cancel()
    await asyncio.gather(task, return_exceptions=True)
