"""浏览器任务执行领域规则测试。"""

import json

import pytest
from pydantic import ValidationError
from xhs_core.domain import (
    BrowserTaskExecutionResult,
    BrowserTaskKind,
    BrowserTaskStatus,
    browser_task_may_write_platform,
    sanitize_browser_page_diagnostics,
    sanitize_browser_task_message,
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


def test_page_diagnostics_are_strictly_whitelisted_and_bounded() -> None:
    """确保页面诊断只保留当前适配器的有界结构标识。"""
    sensitive_token = "sensitive-token-value"
    diagnostics = sanitize_browser_page_diagnostics(
        {
            "adapter_version": "xhs-web-2026.07",
            "selector_profile": "initial-state-v1",
            "page_kind": "feed_detail",
            "matched_anchors": [
                "main_container",
                "authorization",
                "main_container",
                "initial_state",
                *["unknown_anchor"] * 100,
            ],
            "missing_anchors": [
                "detail_container",
                "https://example.invalid/private",
                "comment_container",
            ],
            "url": "https://example.invalid/private",
            "token": sensitive_token,
            "raw_page": "<html>用户原文</html>",
            "user_text": "用户原文",
        }
    )

    assert diagnostics == {
        "adapter_version": "xhs-web-2026.07",
        "selector_profile": "initial-state-v1",
        "page_kind": "feed_detail",
        "matched_anchors": ["main_container", "initial_state"],
        "missing_anchors": ["detail_container", "comment_container"],
    }
    serialized = json.dumps(diagnostics, ensure_ascii=False)
    assert len(serialized) < 400
    assert sensitive_token not in serialized
    assert "用户原文" not in serialized
    assert "example.invalid" not in serialized


def test_page_diagnostics_drop_unknown_and_oversized_values() -> None:
    """确保恶意超长或伪装成诊断字段的文本不会进入结果。"""
    diagnostics = sanitize_browser_page_diagnostics(
        {
            "adapter_version": "xhs-web-" + "x" * 100_000,
            "selector_profile": "https://example.invalid/token",
            "page_kind": "用户输入的页面",
            "matched_anchors": [
                *["unknown_anchor"] * 16,
                "initial_state",
            ],
            "missing_anchors": "detail_container",
        }
    )

    assert diagnostics == {"matched_anchors": []}


@pytest.mark.parametrize(
    ("status", "expected"),
    [
        (
            BrowserTaskStatus.FAILED,
            "浏览器任务执行失败，可安全重试",
        ),
        (
            BrowserTaskStatus.NEEDS_REVIEW,
            "浏览器操作结果无法确认，请人工核对平台状态",
        ),
    ],
)
def test_terminal_failure_messages_are_server_controlled(
    status: BrowserTaskStatus,
    expected: str,
) -> None:
    """确保失败消息不会保留 URL、令牌或用户原文。

    Args:
        status: 待清洗的失败终态。
        expected: 服务端固定安全摘要。
    """
    unsafe = "https://example.invalid token=secret 用户原文"

    assert sanitize_browser_task_message(status, unsafe) == expected
