"""浏览器只读 Provider 边界异常映射测试。"""

import asyncio
from datetime import UTC, datetime

import pytest
from xhs_core.application import BrowserReadProvider
from xhs_core.domain import (
    BrowserDriver,
    BrowserTask,
    BrowserTaskError,
    BrowserTaskKind,
    BrowserTaskStatus,
    ProviderError,
    ProviderFailureCode,
    ProviderKind,
)


class _Ready:
    async def ensure_available(self, driver: BrowserDriver) -> None:
        assert isinstance(driver, BrowserDriver)


class _ProbeError:
    def __init__(self, error: Exception) -> None:
        self.error = error

    async def ensure_available(self, driver: BrowserDriver) -> None:
        raise self.error


class _TaskStub:
    def __init__(
        self,
        task: BrowserTask | None = None,
        *,
        submit_error: Exception | None = None,
        wait_error: Exception | None = None,
        cancel_error: Exception | None = None,
        cancel_result: BrowserTask | None = None,
    ) -> None:
        self.task = task or _task()
        self.submit_error = submit_error
        self.wait_error = wait_error
        self.cancel_error = cancel_error
        self.cancel_result = cancel_result or self.task
        self.cancel_calls = 0

    async def submit(self, *args, **kwargs) -> BrowserTask:
        if self.submit_error:
            raise self.submit_error
        return self.task

    async def wait(self, *args, **kwargs) -> BrowserTask:
        if self.wait_error:
            raise self.wait_error
        return self.task

    async def cancel_before_running(self, *args, **kwargs) -> BrowserTask:
        self.cancel_calls += 1
        if self.cancel_error:
            raise self.cancel_error
        return self.cancel_result


class _BlockingTasks(_TaskStub):
    def __init__(self, cancel_error: Exception | None = None) -> None:
        super().__init__(cancel_error=cancel_error)
        self.waiting = asyncio.Event()

    async def wait(self, *args, **kwargs) -> BrowserTask:
        self.waiting.set()
        await asyncio.Event().wait()
        raise AssertionError("合成等待不应自然结束")


def _task(
    status: BrowserTaskStatus = BrowserTaskStatus.QUEUED,
    *,
    kind: BrowserTaskKind = BrowserTaskKind.LIST_FEEDS,
    driver: BrowserDriver = BrowserDriver.EXTENSION,
    result: dict | None = None,
) -> BrowserTask:
    now = datetime.now(UTC)
    return BrowserTask(
        task_id="synthetic-task",
        kind=kind,
        target_driver=driver,
        status=status,
        result=result,
        created_at=now,
        updated_at=now,
    )


def _provider(tasks: _TaskStub, readiness=None) -> BrowserReadProvider:
    return BrowserReadProvider(
        tasks,
        readiness or _Ready(),
        BrowserDriver.EXTENSION,
        timeout_seconds=1,
        poll_interval=0.01,
    )


@pytest.mark.parametrize(
    ("error", "expected_code"),
    [
        (RuntimeError("synthetic"), ProviderFailureCode.UNAVAILABLE),
        (
            ProviderError(
                ProviderKind.HTTP,
                ProviderFailureCode.UNSUPPORTED,
                "合成 HTTP 错误",
            ),
            ProviderFailureCode.UNSUPPORTED,
        ),
    ],
)
async def test_readiness_errors_are_normalized_to_browser_provider(
    error: Exception,
    expected_code: ProviderFailureCode,
) -> None:
    """确保可用性端口异常始终转换为浏览器 ProviderError。

    Args:
        error: 合成可用性异常。
        expected_code: 期望保留或映射后的错误分类。
    """
    provider = _provider(_TaskStub(), _ProbeError(error))

    with pytest.raises(ProviderError) as captured:
        await provider.list_feeds()

    assert captured.value.provider is ProviderKind.BROWSER
    assert captured.value.code is expected_code


@pytest.mark.parametrize(
    ("error", "expected_code"),
    [
        (BrowserTaskError("synthetic"), ProviderFailureCode.INVALID_RESULT),
        (RuntimeError("synthetic"), ProviderFailureCode.UNAVAILABLE),
    ],
)
async def test_submission_errors_are_typed(
    error: Exception,
    expected_code: ProviderFailureCode,
) -> None:
    """确保任务输入冲突和存储异常使用稳定分类。

    Args:
        error: 合成提交异常。
        expected_code: 期望的 Provider 失败分类。
    """
    provider = _provider(_TaskStub(submit_error=error))

    with pytest.raises(ProviderError) as captured:
        await provider.list_feeds()

    assert captured.value.code is expected_code


@pytest.mark.parametrize(
    ("cancel_error", "expected_code"),
    [
        (None, ProviderFailureCode.UNAVAILABLE),
        (RuntimeError("synthetic cancel"), ProviderFailureCode.EFFECT_UNCERTAIN),
    ],
)
async def test_wait_error_attempts_safe_cancellation(
    cancel_error: Exception | None,
    expected_code: ProviderFailureCode,
) -> None:
    """确保等待存储异常时先取消任务，再返回可判定失败。

    Args:
        cancel_error: 可选合成取消异常。
        expected_code: 期望的 Provider 失败分类。
    """
    tasks = _TaskStub(
        wait_error=RuntimeError("synthetic wait"),
        cancel_error=cancel_error,
    )

    with pytest.raises(ProviderError) as captured:
        await _provider(tasks).list_feeds()

    assert captured.value.code is expected_code
    assert tasks.cancel_calls == 1


async def test_timeout_cancellation_failure_is_not_safely_hidden() -> None:
    """确保无法取消排队任务时禁止路由静默回退。"""
    tasks = _TaskStub(cancel_error=RuntimeError("synthetic cancel"))

    with pytest.raises(ProviderError) as captured:
        await _provider(tasks).list_feeds()

    assert captured.value.code is ProviderFailureCode.EFFECT_UNCERTAIN
    assert captured.value.safe_to_fallback is False


@pytest.mark.parametrize("cancel_error", [None, RuntimeError("synthetic")])
async def test_caller_cancellation_cleans_pending_task(
    cancel_error: Exception | None,
) -> None:
    """确保调用协程取消时尝试撤销任务且保留原始取消语义。

    Args:
        cancel_error: 可选合成清理异常。
    """
    tasks = _BlockingTasks(cancel_error)
    operation = asyncio.create_task(_provider(tasks).list_feeds())
    await tasks.waiting.wait()

    operation.cancel()
    with pytest.raises(asyncio.CancelledError):
        await operation

    assert tasks.cancel_calls == 1


async def test_terminal_race_after_timeout_returns_verified_success() -> None:
    """确保超时取消竞态中已经完成的任务仍返回可信结果。"""
    succeeded = _task(
        BrowserTaskStatus.SUCCEEDED,
        result={
            "items": [],
            "source": "home",
            "keyword": None,
            "has_more": False,
            "cursor": "",
        },
    )
    tasks = _TaskStub(cancel_result=succeeded)

    result = await _provider(tasks).list_feeds()

    assert result.source == "home"
    assert tasks.cancel_calls == 1


@pytest.mark.parametrize(
    "task",
    [
        _task(
            BrowserTaskStatus.SUCCEEDED,
            driver=BrowserDriver.MANAGED,
            result={
                "items": [],
                "source": "home",
                "keyword": None,
                "has_more": False,
                "cursor": "",
            },
        ),
        _task(BrowserTaskStatus.SUCCEEDED, result=None),
    ],
)
async def test_terminal_task_must_match_request_and_include_result(
    task: BrowserTask,
) -> None:
    """确保错误驱动或缺失结果不能伪装成成功任务。

    Args:
        task: 合成的不可信成功任务。
    """
    with pytest.raises(ProviderError) as captured:
        await _provider(_TaskStub(task)).list_feeds()

    assert captured.value.code is ProviderFailureCode.INVALID_RESULT


@pytest.mark.parametrize(
    ("timeout_seconds", "poll_interval"),
    [(0, 0.1), (1, 0)],
)
def test_provider_requires_positive_wait_parameters(
    timeout_seconds: float,
    poll_interval: float,
) -> None:
    """确保等待上限和轮询间隔必须为正数。

    Args:
        timeout_seconds: 合成等待上限。
        poll_interval: 合成轮询间隔。
    """
    with pytest.raises(ValueError, match="必须大于零"):
        BrowserReadProvider(
            _TaskStub(),
            _Ready(),
            BrowserDriver.EXTENSION,
            timeout_seconds,
            poll_interval,
        )
