"""浏览器任务领域模型测试。"""

from datetime import UTC, datetime

from xhs_core.domain import (
    BrowserTask,
    BrowserTaskKind,
    BrowserTaskStatus,
    can_retry_browser_task,
)


def _task(status: BrowserTaskStatus) -> BrowserTask:
    now = datetime.now(UTC)
    return BrowserTask(
        task_id="synthetic-task",
        kind=BrowserTaskKind.CHECK_LOGIN_STATUS,
        status=status,
        created_at=now,
        updated_at=now,
    )


def test_browser_task_retry_rule_rejects_uncertain_results() -> None:
    """确保只有明确失败任务允许重新排队。"""
    assert can_retry_browser_task(_task(BrowserTaskStatus.FAILED))
    assert not can_retry_browser_task(_task(BrowserTaskStatus.NEEDS_REVIEW))
    assert not can_retry_browser_task(_task(BrowserTaskStatus.SUCCEEDED))


def test_browser_task_payload_and_result_are_json_snapshots() -> None:
    """确保任务输入与结果能稳定完成 JSON 往返。"""
    task = _task(BrowserTaskStatus.SUCCEEDED).model_copy(
        update={
            "payload": {"keyword": "合成关键词", "limit": 20},
            "result": {"items": [{"id": "synthetic-feed"}]},
        }
    )

    restored = BrowserTask.model_validate_json(task.model_dump_json())

    assert restored.kind is BrowserTaskKind.CHECK_LOGIN_STATUS
    assert restored.payload["limit"] == 20
    assert restored.result == {"items": [{"id": "synthetic-feed"}]}
