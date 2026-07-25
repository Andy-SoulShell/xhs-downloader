"""受管发布验证恢复的同页安全集成测试。"""

import asyncio
from pathlib import Path
from typing import cast

from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from xhs_adapters.managed_publication_executor import (
    PlaywrightManagedPublicationExecutor,
)
from xhs_api.managed_publication import create_managed_publication_router
from xhs_core.application import (
    ManagedBrowserExecutionGate,
    ManagedPublicationWorker,
    PublicationExecutionService,
    PublicationTaskService,
)
from xhs_core.domain import (
    ManagedPublicationProgress,
    PublicationTask,
    PublicationTaskStatus,
)

from tests.infrastructure.managed_page_fakes import (
    FakeController,
    synthetic_browser_status,
)
from tests.infrastructure.managed_publication_fakes import (
    FakePublicationPage,
    FakePublicationSession,
)
from tests.infrastructure.managed_publication_scenarios import (
    PENDING_RESPONSE,
    PUBLISHED_RESPONSE,
    native_publication_responses,
    synthetic_publication_task,
)


class _Tasks:
    """保存验证流程实时状态的合成任务查询服务。"""

    def __init__(self, task: PublicationTask) -> None:
        """保存当前任务。

        Args:
            task: 接口查询时返回的合成任务。
        """
        self.task = task

    async def require(self, task_id: str) -> PublicationTask:
        """返回当前任务。

        Args:
            task_id: 待查询任务标识；本合成服务只保存一个任务。

        Returns:
            最近一次进度回调保存的任务。
        """
        assert task_id == self.task.task_id
        return self.task


async def test_post_click_resume_continues_observation_without_second_click(
    tmp_path: Path,
) -> None:
    """确保 API 经当前 Worker 恢复点击后验证时不会再次点击发布。

    Args:
        tmp_path: Pytest 提供的合成素材目录。
    """
    task, paths = synthetic_publication_task(tmp_path, "image")
    responses = native_publication_responses(
        "image",
        observe=[
            PENDING_RESPONSE,
            {
                "ok": True,
                "state": "awaiting_verification",
                "message": "创作平台要求完成安全验证",
            },
            PUBLISHED_RESPONSE,
        ],
    )
    page = FakePublicationPage(responses=responses)
    controller = FakeController(synthetic_browser_status())
    executor = PlaywrightManagedPublicationExecutor(
        controller,
        lambda: FakePublicationSession(page),
        observation_timeout=0.1,
        poll_interval=0.001,
    )
    worker = ManagedPublicationWorker(
        controller,
        cast(PublicationExecutionService, object()),
        executor,
        ManagedBrowserExecutionGate(),
    )
    tasks = _Tasks(task)
    paused = asyncio.Event()

    async def report(progress: ManagedPublicationProgress) -> None:
        tasks.task = tasks.task.model_copy(
            update={
                "status": progress.status,
                "publish_attempted": progress.publish_attempted,
            }
        )
        if progress.status is PublicationTaskStatus.AWAITING_VERIFICATION:
            paused.set()

    api = FastAPI()
    api.include_router(
        create_managed_publication_router(
            cast(PublicationTaskService, tasks),
            worker,
            lambda _: True,
        )
    )
    running = asyncio.create_task(executor.execute(task, paths, report))
    try:
        await asyncio.wait_for(paused.wait(), timeout=1)
        assert tasks.task.publish_attempted is True
        assert len(page.click_calls) == 1
        async with AsyncClient(
            transport=ASGITransport(app=api),
            base_url="http://127.0.0.1:5556",
        ) as client:
            response = await client.post(
                f"/publication/tasks/{task.task_id}/verification/resume",
                json={"confirmed": True},
            )
        outcome = await asyncio.wait_for(running, timeout=1)
    finally:
        await worker.close()
        await asyncio.gather(running, return_exceptions=True)

    assert response.status_code == 202
    assert response.json()["publish_attempted"] is True
    assert outcome.status is PublicationTaskStatus.PUBLISHED
    assert len(page.click_calls) == 1
