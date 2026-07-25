"""构造受管浏览器页面任务的结构化执行结果。"""

from typing import Any

from xhs_core.domain import (
    BrowserTask,
    BrowserTaskExecutionResult,
    BrowserTaskKind,
    BrowserTaskStatus,
)


def parse_managed_page_response(
    value: dict[str, Any],
) -> BrowserTaskExecutionResult:
    """把页面适配器响应转换为受管任务终态。

    Args:
        value: 页面适配器返回的未知结构化响应。

    Returns:
        已裁剪用户消息并限制结果类型的任务终态。
    """
    message = value.get("message")
    safe_message = (
        message[:1000]
        if isinstance(message, str) and message
        else "受管浏览器任务执行完成"
    )
    raw_status = value.get("status")
    if raw_status == BrowserTaskStatus.NEEDS_REVIEW.value:
        status = BrowserTaskStatus.NEEDS_REVIEW
    elif value.get("ok") is True:
        status = BrowserTaskStatus.SUCCEEDED
    else:
        status = BrowserTaskStatus.FAILED
    result = value.get("result")
    return BrowserTaskExecutionResult(
        status=status,
        message=safe_message,
        result=result if isinstance(result, dict) else None,
    )


def should_keep_login_page(
    task: BrowserTask,
    outcome: BrowserTaskExecutionResult,
) -> bool:
    """判断二维码登录页面是否应在任务完成后继续保留。

    Args:
        task: 当前受管浏览器任务。
        outcome: 页面执行器返回的结构化终态。

    Returns:
        成功交付未登录二维码时返回真。
    """
    return bool(
        task.kind is BrowserTaskKind.GET_LOGIN_QRCODE
        and outcome.status is BrowserTaskStatus.SUCCEEDED
        and outcome.result
        and outcome.result.get("is_logged_in") is False
    )


def managed_task_failure(
    message: str,
    result: dict[str, Any] | None = None,
) -> BrowserTaskExecutionResult:
    """构造不包含异常原文的受管任务明确失败结果。

    Args:
        message: 面向用户且不包含敏感信息的失败摘要。
        result: 可选的脱敏诊断。

    Returns:
        可安全保存的失败终态。
    """
    return BrowserTaskExecutionResult(
        status=BrowserTaskStatus.FAILED,
        message=message,
        result=result,
    )
