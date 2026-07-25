"""浏览器执行服务失败诊断安全边界测试。"""

import pytest
from xhs_adapters.sqlite import SqliteBrowserTaskRepository
from xhs_core.application import BrowserExecutionService, BrowserTaskService
from xhs_core.domain import BrowserTaskError, BrowserTaskKind, BrowserTaskStatus


@pytest.mark.parametrize(
    "status",
    [BrowserTaskStatus.FAILED, BrowserTaskStatus.NEEDS_REVIEW],
)
async def test_terminal_failure_persists_only_safe_diagnostics(
    tmp_path,
    status: BrowserTaskStatus,
) -> None:
    """确保失败与待核对结果在写仓储前经过同一白名单。

    Args:
        tmp_path: Pytest 提供的临时目录。
        status: 待验证的非成功终态。
    """
    repository = SqliteBrowserTaskRepository(tmp_path.joinpath("state.db"))
    tasks = BrowserTaskService(repository)
    execution = BrowserExecutionService(repository, lease_seconds=60)
    task = await tasks.submit(BrowserTaskKind.CHECK_LOGIN_STATUS, {})
    claim = await execution.claim("synthetic-extension")
    assert claim is not None
    sensitive_token = "sensitive-diagnostic-token"
    sensitive_message = (
        f"页面异常 {sensitive_token} https://example.invalid/private 用户输入"
    )

    completed = await execution.update(
        task.task_id,
        claim.lease_token,
        status,
        sensitive_message,
        {
            "adapter_version": "xhs-web-2026.07",
            "selector_profile": "semantic-dom-v1",
            "page_kind": "home",
            "matched_anchors": [
                "main_container",
                "authorization",
                "main_container",
            ],
            "missing_anchors": ["initial_state", "raw_page"],
            "url": "https://example.invalid/private",
            "token": sensitive_token,
            "raw_page": "<html>用户页面原文</html>",
            "user_text": "用户输入",
            "oversized": "x" * 100_000,
        },
    )
    stored = await repository.get(task.task_id)

    expected = {
        "adapter_version": "xhs-web-2026.07",
        "selector_profile": "semantic-dom-v1",
        "page_kind": "home",
        "matched_anchors": ["main_container"],
        "missing_anchors": ["initial_state"],
    }
    assert completed.result == expected
    assert completed.message == (
        "浏览器任务执行失败，可安全重试"
        if status is BrowserTaskStatus.FAILED
        else "浏览器操作结果无法确认，请人工核对平台状态"
    )
    assert stored is not None
    assert stored.result == expected
    assert stored.message == completed.message
    serialized = stored.model_dump_json()
    assert sensitive_token not in serialized
    assert "example.invalid" not in serialized
    assert "用户页面原文" not in serialized
    assert "用户输入" not in serialized
    assert len(serialized) < 3_000


async def test_success_result_still_requires_task_schema(tmp_path) -> None:
    """确保诊断白名单不会放宽成功结果的正式 Schema。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    repository = SqliteBrowserTaskRepository(tmp_path.joinpath("state.db"))
    tasks = BrowserTaskService(repository)
    execution = BrowserExecutionService(repository, lease_seconds=60)
    task = await tasks.submit(BrowserTaskKind.CHECK_LOGIN_STATUS, {})
    claim = await execution.claim("synthetic-extension")
    assert claim is not None

    with pytest.raises(BrowserTaskError, match="结果结构无效"):
        await execution.update(
            task.task_id,
            claim.lease_token,
            BrowserTaskStatus.SUCCEEDED,
            "登录状态已读取",
            {
                "logged_in": False,
                "user_id": None,
                "nickname": None,
                "url": "https://example.invalid/private",
            },
        )

    stored = await repository.get(task.task_id)
    assert stored is not None
    assert stored.status is BrowserTaskStatus.CLAIMED
    assert stored.result is None
