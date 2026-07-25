"""受管浏览器点赞与收藏目标状态测试。"""

from urllib.parse import parse_qs, urlsplit

import pytest
from xhs_adapters.managed_task_executor import PlaywrightManagedTaskExecutor
from xhs_core.domain import (
    BrowserTaskKind,
    BrowserTaskStatus,
)

from tests.infrastructure.managed_page_fakes import (
    FakeController,
    FakePage,
    FakeSession,
    successful_page_response,
    synthetic_browser_status,
    synthetic_browser_task,
)

_FEED_ID = "synthetic-feed"
_TOKEN = "synthetic-token"
_SELECTORS = {
    "like": ".interact-container .left .like-lottie",
    "favorite": ".interact-container .left .reds-icon.collect-icon",
}


def _payload(active: bool) -> dict[str, object]:
    return {
        "feed_id": _FEED_ID,
        "xsec_token": _TOKEN,
        "active": active,
    }


def _result(
    kind: str,
    active: bool,
    changed: bool,
    *,
    feed_id: str = _FEED_ID,
) -> dict[str, object]:
    return {
        "feed_id": feed_id,
        "kind": kind,
        "active": active,
        "changed": changed,
        "verified": True,
    }


def _action(task_id: str, kind: str, active: bool) -> dict[str, object]:
    return {
        "task_id": task_id,
        "feed_id": _FEED_ID,
        "kind": kind,
        "active": active,
        "selector": _SELECTORS[kind],
    }


@pytest.mark.parametrize(
    ("task_kind", "interaction_kind", "active"),
    [
        (BrowserTaskKind.SET_LIKE, "like", True),
        (BrowserTaskKind.SET_FAVORITE, "favorite", False),
    ],
)
async def test_managed_interaction_uses_trusted_click_and_strict_readback(
    task_kind: BrowserTaskKind,
    interaction_kind: str,
    active: bool,
) -> None:
    """确保同一任务页面完成预检、可信点击和严格回读。

    Args:
        task_kind: 合成的点赞或收藏任务类型。
        interaction_kind: 预期的页面互动语义。
        active: 目标启用状态。
    """
    task = synthetic_browser_task(task_kind, _payload(active))
    page = FakePage(
        responses=[
            {
                "ok": False,
                "message": "需要可信输入",
                "action": _action(task.task_id, interaction_kind, active),
            },
            successful_page_response(_result(interaction_kind, active, changed=True)),
        ]
    )
    session = FakeSession(task_page=page)
    executor = PlaywrightManagedTaskExecutor(
        FakeController(synthetic_browser_status()),
        lambda: session,
    )

    outcome = await executor.execute(task)

    target = urlsplit(page.goto_calls[0][0])
    assert target.path == f"/explore/{_FEED_ID}"
    assert parse_qs(target.query) == {
        "xsec_token": [_TOKEN],
        "xsec_source": ["pc_feed"],
    }
    assert outcome.status is BrowserTaskStatus.SUCCEEDED
    assert outcome.result == _result(interaction_kind, active, changed=True)
    assert page.click_calls == [
        (_SELECTORS[interaction_kind], {"strict": True, "timeout": 5000})
    ]
    assert [value["task_id"] for value in page.execute_args] == [
        task.task_id,
        task.task_id,
    ]
    assert "prepareInteraction" in page.execute_expressions[0]
    assert "verifyInteraction" in page.execute_expressions[1]
    assert page.closed is True
    assert session.closed is True


@pytest.mark.parametrize(
    ("task_kind", "interaction_kind"),
    [
        (BrowserTaskKind.SET_LIKE, "like"),
        (BrowserTaskKind.SET_FAVORITE, "favorite"),
    ],
)
async def test_managed_interaction_skips_click_when_target_already_met(
    task_kind: BrowserTaskKind,
    interaction_kind: str,
) -> None:
    """确保已满足目标状态时返回 changed=false 且不触发输入。

    Args:
        task_kind: 合成的点赞或收藏任务类型。
        interaction_kind: 预期的页面互动语义。
    """
    page = FakePage(
        responses=[
            successful_page_response(_result(interaction_kind, True, changed=False))
        ]
    )
    session = FakeSession(task_page=page)
    executor = PlaywrightManagedTaskExecutor(
        FakeController(synthetic_browser_status()),
        lambda: session,
    )

    outcome = await executor.execute(synthetic_browser_task(task_kind, _payload(True)))

    assert outcome.status is BrowserTaskStatus.SUCCEEDED
    assert outcome.result == _result(interaction_kind, True, changed=False)
    assert page.click_calls == []
    assert len(page.execute_args) == 1
    assert page.closed is True
    assert session.closed is True


@pytest.mark.parametrize("failure", ["page", "wrong_task"])
async def test_managed_interaction_reports_pre_action_failure_as_failed(
    failure: str,
) -> None:
    """确保页面拒绝预检或任务绑定错误时不会点击且可安全失败。

    Args:
        failure: 页面明确失败或返回其他任务的动作授权。
    """
    if failure == "wrong_task":
        response = {
            "ok": False,
            "message": "互动状态需要受管浏览器可信输入",
            "action": _action("other-task", "like", True),
        }
    else:
        response = {
            "ok": False,
            "status": "failed",
            "message": "页面没有点赞按钮",
            "result": {"page_kind": "synthetic-detail"},
        }
    page = FakePage(responses=[response])
    session = FakeSession(task_page=page)
    executor = PlaywrightManagedTaskExecutor(
        FakeController(synthetic_browser_status()),
        lambda: session,
    )

    outcome = await executor.execute(
        synthetic_browser_task(BrowserTaskKind.SET_LIKE, _payload(True))
    )

    assert outcome.status is BrowserTaskStatus.FAILED
    assert "人工核对" not in outcome.message
    assert page.click_calls == []
    assert page.closed is True
    assert session.closed is True


@pytest.mark.parametrize("field", ["feed_id", "kind", "active", "changed"])
@pytest.mark.parametrize("invalid_phase", ["before", "after"])
async def test_managed_interaction_rejects_mismatched_results(
    invalid_phase: str,
    field: str,
) -> None:
    """确保错误互动结果不会冒充原任务成功。

    Args:
        invalid_phase: 错误结果出现在动作前或动作后的阶段。
        field: 与原任务不一致的结果字段。
    """
    task = synthetic_browser_task(BrowserTaskKind.SET_LIKE, _payload(True))
    invalid_result = _result("like", True, changed=invalid_phase == "after")
    invalid_result[field] = {
        "feed_id": "other",
        "kind": "favorite",
        "active": False,
        "changed": invalid_phase != "after",
    }[field]
    invalid = successful_page_response(invalid_result)
    responses = [invalid]
    if invalid_phase == "after":
        responses = [
            {
                "ok": False,
                "message": "需要可信输入",
                "action": _action(task.task_id, "like", True),
            },
            invalid,
        ]
    page = FakePage(responses=responses)
    session = FakeSession(task_page=page)
    executor = PlaywrightManagedTaskExecutor(
        FakeController(synthetic_browser_status()),
        lambda: session,
    )

    outcome = await executor.execute(task)

    expected = (
        BrowserTaskStatus.FAILED
        if invalid_phase == "before"
        else BrowserTaskStatus.NEEDS_REVIEW
    )
    assert outcome.status is expected
    assert len(page.click_calls) == (invalid_phase == "after")
    assert page.closed is True
    assert session.closed is True


@pytest.mark.parametrize("failure", ["verification", "malformed", "click"])
async def test_managed_interaction_marks_post_action_uncertainty_for_review(
    failure: str,
) -> None:
    """确保输入阶段开始后的失败一律要求人工核对。

    Args:
        failure: 模拟页面回读不确定或可信点击调用异常。
    """
    task = synthetic_browser_task(BrowserTaskKind.SET_FAVORITE, _payload(True))
    responses = [
        {
            "ok": False,
            "message": "需要可信输入",
            "action": _action(task.task_id, "favorite", True),
        }
    ]
    if failure != "click":
        responses.append(
            {
                "ok": failure == "malformed",
                "status": (
                    {"invalid": True} if failure == "malformed" else "needs_review"
                ),
                "message": "收藏状态无法确认",
            }
        )
    click_error = (
        RuntimeError("synthetic click failure") if failure == "click" else None
    )
    page = FakePage(responses=responses, click_error=click_error)
    session = FakeSession(task_page=page)
    executor = PlaywrightManagedTaskExecutor(
        FakeController(synthetic_browser_status()),
        lambda: session,
    )

    outcome = await executor.execute(task)

    assert outcome.status is BrowserTaskStatus.NEEDS_REVIEW
    assert "人工核对" in outcome.message
    assert len(page.click_calls) == 1
    assert page.closed is True
    assert session.closed is True
