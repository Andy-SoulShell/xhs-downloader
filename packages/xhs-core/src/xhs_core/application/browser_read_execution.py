"""浏览器只读 Provider 的任务执行、超时取消与终态解析。"""

from asyncio import CancelledError
from collections.abc import Callable
from typing import Never

from pydantic import BaseModel, JsonValue, ValidationError

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

from .browser_readiness import BrowserReadinessProbe
from .browser_tasks import BrowserTaskService

_TIMEOUT_MESSAGE = "统一能力等待超时，浏览器任务已在页面执行前取消"


class _BrowserReadExecution:
    def __init__(
        self,
        tasks: BrowserTaskService,
        readiness: BrowserReadinessProbe,
        driver: BrowserDriver,
        timeout_seconds: float,
        poll_interval: float,
    ) -> None:
        self._tasks = tasks
        self._readiness = readiness
        self._driver = driver
        self._timeout_seconds = timeout_seconds
        self._poll_interval = poll_interval

    async def execute[T: BaseModel](
        self,
        kind: BrowserTaskKind,
        payload: dict[str, JsonValue],
        request_id: str | None,
        result_model: type[T],
        identity_matches: Callable[[T], bool],
        mismatch_message: str,
    ) -> T:
        """提交并等待一个浏览器只读任务。

        Args:
            kind: 浏览器只读任务类型。
            payload: 已由具体能力构造的结构化输入。
            request_id: 可选的调用方幂等标识。
            result_model: 成功终态必须符合的结果模型。
            identity_matches: 核对结果与请求对象是否一致。
            mismatch_message: 对象不一致时的安全错误说明。

        Returns:
            通过结构和对象身份双重核验的能力结果。

        Raises:
            ProviderError: 驱动不可用、任务超时或结果不可信。
        """
        await self._ensure_available()
        try:
            submitted = await self._tasks.submit(
                kind,
                payload,
                request_id,
                self._driver,
            )
        except BrowserTaskError as error:
            raise _error(
                ProviderFailureCode.INVALID_RESULT,
                "浏览器任务输入或幂等请求无效",
            ) from error
        except Exception as error:
            raise _error(
                ProviderFailureCode.UNAVAILABLE,
                "浏览器任务暂时无法提交",
            ) from error
        try:
            task = await self._tasks.wait(
                submitted.task_id,
                self._timeout_seconds,
                self._poll_interval,
            )
        except CancelledError as canceled:
            try:
                await self._tasks.cancel_before_running(
                    submitted.task_id,
                    "调用方已取消等待，任务已在页面执行前取消",
                )
            except Exception:
                canceled.add_note("浏览器任务取消清理失败，请检查任务队列")
            raise
        except Exception as error:
            await self._cancel_after_wait_error(submitted.task_id, error)
        if task.status in {
            BrowserTaskStatus.QUEUED,
            BrowserTaskStatus.CLAIMED,
            BrowserTaskStatus.RUNNING,
        }:
            task = await self._cancel_after_timeout(task)
        return _parse_terminal(
            task,
            kind,
            self._driver,
            result_model,
            identity_matches,
            mismatch_message,
        )

    async def _ensure_available(self) -> None:
        try:
            await self._readiness.ensure_available(self._driver)
        except ProviderError as error:
            if error.provider is ProviderKind.BROWSER:
                raise
            raise _error(error.code, error.message) from error
        except Exception as error:
            raise _error(
                ProviderFailureCode.UNAVAILABLE,
                "浏览器驱动状态检查失败",
            ) from error

    async def _cancel_after_timeout(self, task: BrowserTask) -> BrowserTask:
        try:
            latest = await self._tasks.cancel_before_running(
                task.task_id,
                _TIMEOUT_MESSAGE,
            )
        except Exception as error:
            raise _error(
                ProviderFailureCode.EFFECT_UNCERTAIN,
                "无法确认超时的浏览器任务是否仍在排队",
            ) from error
        canceled = (
            latest.status is BrowserTaskStatus.FAILED
            and latest.message == _TIMEOUT_MESSAGE
        )
        if canceled:
            raise _error(
                ProviderFailureCode.TIMEOUT_BEFORE_EFFECT,
                "浏览器未在等待时间内开始读取",
            )
        if latest.status is BrowserTaskStatus.RUNNING:
            raise _error(
                ProviderFailureCode.TIMEOUT_BEFORE_EFFECT,
                "浏览器读取已经开始，但未在等待时间内完成",
            )
        return latest

    async def _cancel_after_wait_error(
        self,
        task_id: str,
        wait_error: Exception,
    ) -> Never:
        try:
            await self._tasks.cancel_before_running(
                task_id,
                "等待浏览器任务时发生异常，已在页面执行前取消",
            )
        except Exception as cancel_error:
            raise _error(
                ProviderFailureCode.EFFECT_UNCERTAIN,
                "浏览器任务等待和取消均失败",
            ) from cancel_error
        raise _error(
            ProviderFailureCode.UNAVAILABLE,
            "浏览器任务状态暂时无法读取",
        ) from wait_error


def _parse_terminal[T: BaseModel](
    task: BrowserTask,
    expected_kind: BrowserTaskKind,
    expected_driver: BrowserDriver,
    result_model: type[T],
    identity_matches: Callable[[T], bool],
    mismatch_message: str,
) -> T:
    if task.kind is not expected_kind or task.target_driver is not expected_driver:
        raise _error(
            ProviderFailureCode.INVALID_RESULT,
            "浏览器返回了不属于本次调用的任务",
        )
    if task.status is BrowserTaskStatus.FAILED:
        code = (
            ProviderFailureCode.UNAVAILABLE
            if task.attempts == 0
            else ProviderFailureCode.PAGE_INCOMPATIBLE
        )
        raise _error(code, task.message or "浏览器读取失败")
    if task.status is BrowserTaskStatus.NEEDS_REVIEW:
        raise _error(
            ProviderFailureCode.EFFECT_UNCERTAIN,
            "浏览器读取任务返回了无法确认的状态",
        )
    if task.status is not BrowserTaskStatus.SUCCEEDED or task.result is None:
        raise _error(
            ProviderFailureCode.INVALID_RESULT,
            "浏览器任务没有返回可验证的成功结果",
        )
    try:
        result = result_model.model_validate(task.result, strict=True)
    except ValidationError as error:
        raise _error(
            ProviderFailureCode.INVALID_RESULT,
            "浏览器返回结果不符合能力契约",
        ) from error
    if not identity_matches(result):
        raise _error(ProviderFailureCode.INVALID_RESULT, mismatch_message)
    return result


def _error(code: ProviderFailureCode, message: str) -> ProviderError:
    return ProviderError(ProviderKind.BROWSER, code, message)
