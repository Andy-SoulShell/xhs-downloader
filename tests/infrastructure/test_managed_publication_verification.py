"""受管发布安全验证的同页暂停、恢复与关闭测试。"""

import asyncio
from pathlib import Path

import pytest
from xhs_adapters.managed_publication import (
    PlaywrightManagedPublicationExecutor,
)
from xhs_core.domain import (
    ManagedBrowserError,
    ManagedPublicationProgress,
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

_VERIFICATION_STEP = {
    "ok": False,
    "message": "创作平台要求完成安全验证",
    "verification": True,
}
_VERIFICATION_OBSERVATION = {
    "ok": True,
    "state": "awaiting_verification",
    "message": "创作平台要求完成安全验证",
}


async def test_pre_click_verification_resumes_interrupted_step_on_same_page(
    tmp_path: Path,
) -> None:
    """确保点击前验证恢复后只重做中断步骤并继续同一页面。

    Args:
        tmp_path: Pytest 提供的合成素材目录。
    """
    task, paths = synthetic_publication_task(tmp_path, "image")
    responses = native_publication_responses(
        "image",
        observe=[PENDING_RESPONSE, PUBLISHED_RESPONSE],
    )
    successful_upload = responses["upload"][0]
    responses["upload"] = [_VERIFICATION_STEP, successful_upload]
    page = FakePublicationPage(responses=responses)
    session = FakePublicationSession(page)
    executor = _executor(session)
    progresses: list[ManagedPublicationProgress] = []
    paused = asyncio.Event()

    async def report(progress: ManagedPublicationProgress) -> None:
        progresses.append(progress)
        if progress.status is PublicationTaskStatus.AWAITING_VERIFICATION:
            paused.set()

    running = asyncio.create_task(executor.execute(task, paths, report))
    await asyncio.wait_for(paused.wait(), timeout=1)

    assert page.click_calls == []
    assert await executor.resume("other-task") is False
    assert await executor.resume(task.task_id) is True
    assert await executor.resume(task.task_id) is False
    outcome = await asyncio.wait_for(running, timeout=1)

    assert outcome.status is PublicationTaskStatus.PUBLISHED
    assert session.new_page_calls == 1
    assert len(page.init_scripts) == 1
    assert len(page.goto_calls) == 1
    upload_calls = [
        expression
        for expression, _ in page.evaluate_calls
        if ".prepareUpload(" in expression
    ]
    assert len(upload_calls) == 2
    assert [(item.status, item.publish_attempted) for item in progresses] == [
        (PublicationTaskStatus.AWAITING_VERIFICATION, False),
        (PublicationTaskStatus.FILLING, False),
        (PublicationTaskStatus.PUBLISHING, True),
    ]


async def test_post_click_verification_resumes_observation_without_second_click(
    tmp_path: Path,
) -> None:
    """确保点击后验证恢复时只继续观察且发布点击始终一次。

    Args:
        tmp_path: Pytest 提供的合成素材目录。
    """
    task, paths = synthetic_publication_task(tmp_path, "image")
    responses = native_publication_responses(
        "image",
        observe=[
            PENDING_RESPONSE,
            _VERIFICATION_OBSERVATION,
            PUBLISHED_RESPONSE,
        ],
    )
    page = FakePublicationPage(responses=responses)
    session = FakePublicationSession(page)
    executor = _executor(session)
    progresses: list[ManagedPublicationProgress] = []
    paused = asyncio.Event()

    async def report(progress: ManagedPublicationProgress) -> None:
        progresses.append(progress)
        if progress.status is PublicationTaskStatus.AWAITING_VERIFICATION:
            paused.set()

    running = asyncio.create_task(executor.execute(task, paths, report))
    await asyncio.wait_for(paused.wait(), timeout=1)

    assert len(page.click_calls) == 1
    assert await executor.resume(task.task_id) is True
    outcome = await asyncio.wait_for(running, timeout=1)

    assert outcome.status is PublicationTaskStatus.PUBLISHED
    assert len(page.click_calls) == 1
    assert [(item.status, item.publish_attempted) for item in progresses] == [
        (PublicationTaskStatus.PUBLISHING, True),
        (PublicationTaskStatus.AWAITING_VERIFICATION, True),
        (PublicationTaskStatus.PUBLISHING, True),
    ]


async def test_close_cancels_verification_wait_and_cleans_same_page(
    tmp_path: Path,
) -> None:
    """确保关闭执行器会取消验证等待并断开页面会话。

    Args:
        tmp_path: Pytest 提供的合成素材目录。
    """
    task, paths = synthetic_publication_task(tmp_path, "image")
    responses = native_publication_responses(
        "image",
        observe=[PENDING_RESPONSE],
    )
    responses["upload"] = [_VERIFICATION_STEP]
    page = FakePublicationPage(responses=responses)
    session = FakePublicationSession(page)
    executor = _executor(session)
    paused = asyncio.Event()

    async def report(progress: ManagedPublicationProgress) -> None:
        if progress.status is PublicationTaskStatus.AWAITING_VERIFICATION:
            paused.set()

    running = asyncio.create_task(executor.execute(task, paths, report))
    await asyncio.wait_for(paused.wait(), timeout=1)

    await executor.close()

    with pytest.raises(asyncio.CancelledError):
        await running
    assert page.closed is True
    assert session.closed is True
    assert await executor.resume(task.task_id) is False
    with pytest.raises(ManagedBrowserError, match="已经关闭"):
        await executor.execute(task, paths, report)


def _executor(
    session: FakePublicationSession,
) -> PlaywrightManagedPublicationExecutor:
    return PlaywrightManagedPublicationExecutor(
        FakeController(synthetic_browser_status()),
        lambda: session,
        observation_timeout=0.1,
        poll_interval=0.001,
    )
