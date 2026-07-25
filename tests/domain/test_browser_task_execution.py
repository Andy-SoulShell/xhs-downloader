"""浏览器任务执行领域规则测试。"""

import pytest
from pydantic import ValidationError
from xhs_core.domain import (
    BrowserTaskExecutionResult,
    BrowserTaskKind,
    BrowserTaskStatus,
    browser_task_may_write_platform,
)


def test_execution_result_only_accepts_terminal_status() -> None:
    """确保执行器只能回传受支持的三种终态。"""
    result = BrowserTaskExecutionResult(
        status=BrowserTaskStatus.FAILED,
        message="页面结构不受支持",
        result={"diagnostic_code": "synthetic-page-shape"},
    )

    assert result.result == {"diagnostic_code": "synthetic-page-shape"}
    with pytest.raises(ValidationError):
        BrowserTaskExecutionResult.model_validate(
            {"status": "running", "message": "尚未结束"}
        )


def test_unknown_effects_are_classified_conservatively() -> None:
    """确保读取任务与平台写任务采用不同的中断策略。"""
    assert not browser_task_may_write_platform(BrowserTaskKind.LIST_FEEDS)
    assert not browser_task_may_write_platform(BrowserTaskKind.DELETE_COOKIES)
    assert browser_task_may_write_platform(BrowserTaskKind.SET_LIKE)
    assert browser_task_may_write_platform(BrowserTaskKind.POST_COMMENT)
