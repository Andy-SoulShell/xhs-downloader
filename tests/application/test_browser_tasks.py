"""通用浏览器任务应用服务测试。"""

import asyncio
from datetime import UTC, datetime, timedelta

import pytest
from xhs_adapters.sqlite import SqliteBrowserTaskRepository
from xhs_core.application import BrowserExecutionService, BrowserTaskService
from xhs_core.domain import (
    BrowserTaskError,
    BrowserTaskKind,
    BrowserTaskStatus,
)


def _services(tmp_path):
    repository = SqliteBrowserTaskRepository(tmp_path.joinpath("state.db"))
    return (
        repository,
        BrowserTaskService(repository),
        BrowserExecutionService(repository, lease_seconds=60),
    )


async def test_browser_task_submission_is_idempotent(tmp_path) -> None:
    """确保相同请求只创建一次，冲突请求不会静默复用任务。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    _, tasks, _ = _services(tmp_path)
    created = await tasks.submit(
        BrowserTaskKind.SEARCH_FEEDS,
        {"keyword": "合成关键词"},
        "synthetic-request",
    )
    repeated = await tasks.submit(
        BrowserTaskKind.SEARCH_FEEDS,
        {"keyword": "合成关键词"},
        "synthetic-request",
    )

    assert repeated.task_id == created.task_id
    with pytest.raises(BrowserTaskError, match="另一项"):
        await tasks.submit(
            BrowserTaskKind.GET_MY_PROFILE,
            {},
            "synthetic-request",
        )
    with pytest.raises(BrowserTaskError, match="不存在"):
        await tasks.require("missing")


async def test_browser_execution_claims_and_completes_with_lease(tmp_path) -> None:
    """确保扩展只能凭有效租约推进状态并返回成功结果。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    _, tasks, execution = _services(tmp_path)
    task = await tasks.submit(BrowserTaskKind.CHECK_LOGIN_STATUS, {})
    claim = await execution.claim("synthetic-extension")

    assert claim is not None
    assert claim.task.task_id == task.task_id
    assert claim.task.attempts == 1
    assert await execution.claim("other-extension") is None
    with pytest.raises(BrowserTaskError, match="租约无效"):
        await execution.update(
            task.task_id,
            "wrong",
            BrowserTaskStatus.RUNNING,
            "合成状态",
        )
    running = await execution.update(
        task.task_id,
        claim.lease_token,
        BrowserTaskStatus.RUNNING,
        "正在检查登录状态",
    )
    assert running.status is BrowserTaskStatus.RUNNING
    with pytest.raises(BrowserTaskError, match="结构化结果"):
        await execution.update(
            task.task_id,
            claim.lease_token,
            BrowserTaskStatus.SUCCEEDED,
            "检查完成",
        )
    completed = await execution.update(
        task.task_id,
        claim.lease_token,
        BrowserTaskStatus.SUCCEEDED,
        "检查完成",
        {"logged_in": False, "user_id": None, "nickname": None},
    )

    assert completed.status is BrowserTaskStatus.SUCCEEDED
    assert completed.result["logged_in"] is False
    with pytest.raises(BrowserTaskError, match="租约无效"):
        await execution.update(
            task.task_id,
            claim.lease_token,
            BrowserTaskStatus.RUNNING,
            "陈旧更新",
        )


async def test_failed_task_retries_but_uncertain_task_does_not(tmp_path) -> None:
    """确保明确失败可重试，结果不确定必须人工核对。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    repository, tasks, execution = _services(tmp_path)
    failed_task = await tasks.submit(BrowserTaskKind.GET_MY_PROFILE, {})
    failed_claim = await execution.claim("extension")
    failed = await execution.update(
        failed_task.task_id,
        failed_claim.lease_token,
        BrowserTaskStatus.FAILED,
        "页面明确拒绝执行",
    )
    retried = await tasks.retry(failed.task_id)
    assert retried.status is BrowserTaskStatus.QUEUED
    assert retried.result is None

    uncertain = retried.model_copy(update={"status": BrowserTaskStatus.NEEDS_REVIEW})
    await repository.save(uncertain)
    with pytest.raises(BrowserTaskError, match="人工核对"):
        await tasks.retry(uncertain.task_id)


async def test_wait_returns_terminal_or_latest_snapshot(tmp_path) -> None:
    """确保等待用例在任务完成或超时时返回可观察快照。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    repository, tasks, _ = _services(tmp_path)
    task = await tasks.submit(BrowserTaskKind.LIST_FEEDS, {})

    async def complete() -> None:
        await asyncio.sleep(0)
        await repository.save(
            task.model_copy(update={"status": BrowserTaskStatus.SUCCEEDED})
        )

    operation = asyncio.create_task(complete())
    completed = await tasks.wait(task.task_id, 1, poll_interval=0.01)
    await operation
    pending = await tasks.submit(BrowserTaskKind.GET_MY_PROFILE, {})

    assert completed.status is BrowserTaskStatus.SUCCEEDED
    assert (await tasks.wait(pending.task_id, 0)).status is BrowserTaskStatus.QUEUED
    with pytest.raises(BrowserTaskError, match="等待参数无效"):
        await tasks.wait(pending.task_id, -1)


async def test_expired_leases_follow_operation_safety(tmp_path) -> None:
    """确保安全任务回队列，可能产生评论的任务转为人工核对。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    repository, tasks, execution = _services(tmp_path)
    read_task = await tasks.submit(BrowserTaskKind.LIST_FEEDS, {})
    read_claim = await execution.claim("extension")
    expired_read = read_claim.task.model_copy(
        update={"lease_expires_at": datetime.now(UTC) - timedelta(seconds=1)}
    )
    await repository.save(expired_read)
    await execution.reconcile_expired()
    recovered = await tasks.require(read_task.task_id)
    assert recovered.status is BrowserTaskStatus.QUEUED
    await repository.save(
        recovered.model_copy(update={"status": BrowserTaskStatus.SUCCEEDED})
    )

    write_task = await tasks.submit(
        BrowserTaskKind.POST_COMMENT,
        {
            "feed_id": "synthetic-feed",
            "xsec_token": "synthetic-token",
            "content": "合成评论",
        },
    )
    write_claim = await execution.claim("extension")
    running = await execution.update(
        write_task.task_id,
        write_claim.lease_token,
        BrowserTaskStatus.RUNNING,
        "正在提交评论",
    )
    await repository.save(
        running.model_copy(
            update={"lease_expires_at": datetime.now(UTC) - timedelta(seconds=1)}
        )
    )
    await execution.reconcile_expired()

    reviewed = await tasks.require(write_task.task_id)
    assert reviewed.status is BrowserTaskStatus.NEEDS_REVIEW
    assert "人工核对" in reviewed.message
