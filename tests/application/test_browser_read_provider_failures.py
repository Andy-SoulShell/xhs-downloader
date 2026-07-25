"""浏览器只读 Provider 失败、超时和防孤儿任务测试。"""

import asyncio
from datetime import UTC, datetime

import pytest
from xhs_adapters.sqlite import SqliteBrowserTaskRepository
from xhs_core.application import (
    BrowserExecutionService,
    BrowserReadProvider,
    BrowserTaskService,
)
from xhs_core.domain import (
    BrowserDriver,
    BrowserTaskError,
    BrowserTaskKind,
    BrowserTaskStatus,
    ProviderError,
    ProviderFailureCode,
    ProviderKind,
)

_RUNNING_TASK_TIMEOUT_SECONDS = 0.5


class _Ready:
    async def ensure_available(self, driver: BrowserDriver) -> None:
        assert driver in BrowserDriver


class _Unavailable:
    async def ensure_available(self, driver: BrowserDriver) -> None:
        raise ProviderError(
            ProviderKind.BROWSER,
            ProviderFailureCode.UNAVAILABLE,
            f"合成 {driver.value} 不可用",
        )


def _runtime(
    tmp_path,
    *,
    readiness=None,
    timeout_seconds: float = 0.02,
):
    repository = SqliteBrowserTaskRepository(tmp_path.joinpath("state.db"))
    tasks = BrowserTaskService(repository)
    execution = BrowserExecutionService(repository, lease_seconds=60)
    provider = BrowserReadProvider(
        tasks,
        readiness or _Ready(),
        BrowserDriver.EXTENSION,
        timeout_seconds=timeout_seconds,
        poll_interval=0.001,
    )
    return repository, tasks, execution, provider


async def _wait_for_task(repository: SqliteBrowserTaskRepository):
    for _ in range(1000):
        tasks = await repository.list_recent(1)
        if tasks:
            return tasks[0]
        await asyncio.sleep(0)
    raise AssertionError("浏览器任务未在测试等待窗口内提交")


async def test_unavailable_driver_fails_before_submission(tmp_path) -> None:
    """确保执行通道不可用时不会留下排队任务。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    repository, _, _, provider = _runtime(tmp_path, readiness=_Unavailable())

    with pytest.raises(ProviderError) as captured:
        await provider.list_feeds()

    assert captured.value.code is ProviderFailureCode.UNAVAILABLE
    assert await repository.list_recent(10) == []


async def test_timeout_cancels_queued_task_before_it_can_be_claimed(
    tmp_path,
) -> None:
    """确保等待超时会原子终止仍在队列中的读取任务。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    repository, _, execution, provider = _runtime(
        tmp_path,
        timeout_seconds=0.005,
    )

    with pytest.raises(ProviderError) as captured:
        await provider.list_feeds("synthetic-timeout")

    latest = (await repository.list_recent(1))[0]
    assert captured.value.code is ProviderFailureCode.TIMEOUT_BEFORE_EFFECT
    assert latest.status is BrowserTaskStatus.FAILED
    assert await execution.claim("late-extension") is None


async def test_timeout_revokes_claim_before_page_execution(tmp_path) -> None:
    """确保已领取但未运行的任务会失效且陈旧租约不能启动页面读取。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    repository, _, execution, provider = _runtime(tmp_path)
    operation = asyncio.create_task(provider.list_feeds("synthetic-claimed-timeout"))
    await _wait_for_task(repository)
    claim = await execution.claim("synthetic-extension")
    assert claim is not None

    with pytest.raises(ProviderError) as captured:
        await operation

    latest = await repository.get(claim.task.task_id)
    assert captured.value.code is ProviderFailureCode.TIMEOUT_BEFORE_EFFECT
    assert latest.status is BrowserTaskStatus.FAILED
    with pytest.raises(BrowserTaskError, match="租约无效"):
        await execution.update(
            claim.task.task_id,
            claim.lease_token,
            BrowserTaskStatus.RUNNING,
            "不应开始",
        )


async def test_timeout_does_not_requeue_already_running_read(tmp_path) -> None:
    """确保已经开始的只读任务超时后不会重新排队或重复执行。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    repository, _, execution, provider = _runtime(
        tmp_path,
        timeout_seconds=_RUNNING_TASK_TIMEOUT_SECONDS,
    )
    operation = asyncio.create_task(provider.list_feeds("synthetic-running-timeout"))
    task = await _wait_for_task(repository)
    claim = await execution.claim("synthetic-extension")
    assert claim is not None
    await execution.update(
        task.task_id,
        claim.lease_token,
        BrowserTaskStatus.RUNNING,
        "合成读取已经开始",
    )

    with pytest.raises(ProviderError) as captured:
        await operation

    latest = await repository.get(task.task_id)
    assert captured.value.code is ProviderFailureCode.TIMEOUT_BEFORE_EFFECT
    assert latest.status is BrowserTaskStatus.RUNNING
    assert await execution.claim("second-extension") is None
    await execution.update(
        task.task_id,
        claim.lease_token,
        BrowserTaskStatus.SUCCEEDED,
        "合成读取最终完成",
        {
            "items": [],
            "source": "home",
            "keyword": None,
            "has_more": False,
            "cursor": "",
        },
    )


@pytest.mark.parametrize(
    ("status", "attempts", "expected_code"),
    [
        (
            BrowserTaskStatus.FAILED,
            0,
            ProviderFailureCode.UNAVAILABLE,
        ),
        (
            BrowserTaskStatus.FAILED,
            1,
            ProviderFailureCode.PAGE_INCOMPATIBLE,
        ),
        (
            BrowserTaskStatus.NEEDS_REVIEW,
            1,
            ProviderFailureCode.EFFECT_UNCERTAIN,
        ),
    ],
)
async def test_terminal_failures_map_to_provider_errors(
    tmp_path,
    status: BrowserTaskStatus,
    attempts: int,
    expected_code: ProviderFailureCode,
) -> None:
    """确保浏览器终态使用稳定 Provider 失败分类。

    Args:
        tmp_path: Pytest 提供的临时目录。
        status: 合成任务终态。
        attempts: 合成领取次数。
        expected_code: 期望的路由失败分类。
    """
    repository, tasks, _, provider = _runtime(tmp_path)
    task = await tasks.submit(
        BrowserTaskKind.LIST_FEEDS,
        {},
        "synthetic-terminal",
    )
    await repository.save(
        task.model_copy(
            update={
                "status": status,
                "attempts": attempts,
                "message": "合成页面执行失败",
                "updated_at": datetime.now(UTC),
            }
        )
    )

    with pytest.raises(ProviderError) as captured:
        await provider.list_feeds("synthetic-terminal")

    assert captured.value.code is expected_code


@pytest.mark.parametrize(
    "result",
    [
        {
            "items": [],
            "source": "home",
            "keyword": None,
            "has_more": False,
            "cursor": "",
            "unexpected": True,
        },
        {
            "items": [],
            "source": "search",
            "keyword": "错误来源",
            "has_more": False,
            "cursor": "",
        },
        {
            "items": [],
            "source": "home",
            "keyword": None,
            "has_more": 0,
            "cursor": "",
        },
    ],
)
async def test_success_result_requires_exact_contract_and_identity(
    tmp_path,
    result: dict,
) -> None:
    """确保成功快照也必须通过严格结构与请求身份核验。

    Args:
        tmp_path: Pytest 提供的临时目录。
        result: 合成的无效成功结果。
    """
    repository, tasks, _, provider = _runtime(tmp_path)
    task = await tasks.submit(
        BrowserTaskKind.LIST_FEEDS,
        {},
        "synthetic-invalid-result",
    )
    await repository.save(
        task.model_copy(
            update={
                "status": BrowserTaskStatus.SUCCEEDED,
                "result": result,
                "updated_at": datetime.now(UTC),
            }
        )
    )

    with pytest.raises(ProviderError) as captured:
        await provider.list_feeds("synthetic-invalid-result")

    assert captured.value.code is ProviderFailureCode.INVALID_RESULT
