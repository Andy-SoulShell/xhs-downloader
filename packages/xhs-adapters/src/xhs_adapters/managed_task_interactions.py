"""在同一受管页面中执行并核验点赞与收藏目标状态。"""

from typing import Any

from xhs_core.domain import (
    BrowserTask,
    BrowserTaskError,
    BrowserTaskExecutionResult,
    BrowserTaskKind,
    BrowserTaskStatus,
)
from xhs_core.domain.browser_requests import validate_browser_task_result

from .managed_page_session import ManagedPage

_ADAPTER_GLOBAL = "__XHS_DOWNLOADER_MANAGED_PAGE_ADAPTER__"
PREPARE_INTERACTION_EXPRESSION = (
    f"(task) => window.{_ADAPTER_GLOBAL}.prepareInteraction(task)"
)
_VERIFY_INTERACTION_EXPRESSION = (
    f"(task) => window.{_ADAPTER_GLOBAL}.verifyInteraction(task)"
)
_CLICK_TIMEOUT_MILLISECONDS = 5_000
_INTERACTION_CONFIG = {
    BrowserTaskKind.SET_LIKE: (
        "like",
        ".interact-container .left .like-lottie",
    ),
    BrowserTaskKind.SET_FAVORITE: (
        "favorite",
        ".interact-container .left .reds-icon.collect-icon",
    ),
}


async def complete_managed_interaction(
    page: ManagedPage,
    task: BrowserTask,
    preparation: dict[str, Any],
) -> BrowserTaskExecutionResult:
    """根据页面预检结果完成一次受管互动并严格回读。

    Args:
        page: 已导航到目标帖子的同一受管页面。
        task: 固定为受管驱动且处于运行态的点赞或收藏任务。
        preparation: 共享页面适配器返回的预检响应。

    Returns:
        已确认成功、明确未执行失败或操作后待人工核对的终态。
    """
    if preparation.get("ok") is True:
        return _confirmed_outcome(task, preparation, changed=False, uncertain=False)
    action = preparation.get("action")
    if not _matches_action(task, action):
        return _failed(
            _message(preparation, "页面互动预检失败，未执行任何操作"),
            preparation.get("result"),
        )
    selector = action["selector"]
    try:
        await page.click(
            selector,
            strict=True,
            timeout=_CLICK_TIMEOUT_MILLISECONDS,
        )
    except Exception:
        return _needs_review("互动输入可能已经触发，但无法确认执行阶段，请人工核对")
    try:
        verification = await page.evaluate(
            _VERIFY_INTERACTION_EXPRESSION,
            task.model_dump(mode="json"),
        )
    except Exception:
        return _needs_review("互动操作已触发，但页面状态回读失败，请人工核对")
    if not isinstance(verification, dict):
        return _needs_review("互动操作已触发，但页面返回了无效核验结果，请人工核对")
    return _confirmed_outcome(task, verification, changed=True, uncertain=True)


def _matches_action(task: BrowserTask, value: Any) -> bool:
    if not isinstance(value, dict) or set(value) != {
        "task_id",
        "feed_id",
        "kind",
        "active",
        "selector",
    }:
        return False
    config = _INTERACTION_CONFIG.get(task.kind)
    if config is None:
        return False
    kind, selector = config
    return value == {
        "task_id": task.task_id,
        "feed_id": task.payload.get("feed_id"),
        "kind": kind,
        "active": task.payload.get("active"),
        "selector": selector,
    }


def _confirmed_outcome(
    task: BrowserTask,
    response: dict[str, Any],
    *,
    changed: bool,
    uncertain: bool,
) -> BrowserTaskExecutionResult:
    status = response.get("status")
    if response.get("ok") is not True or (
        status is not None and status != BrowserTaskStatus.SUCCEEDED.value
    ):
        return _invalid_confirmation(response, uncertain)
    raw_result = response.get("result")
    if not isinstance(raw_result, dict):
        return _invalid_confirmation(response, uncertain)
    try:
        normalized = validate_browser_task_result(task.kind, raw_result)
    except BrowserTaskError:
        return _invalid_confirmation(response, uncertain)
    config = _INTERACTION_CONFIG.get(task.kind)
    if config is None:
        return _invalid_confirmation(response, uncertain)
    expected = {
        "feed_id": task.payload.get("feed_id"),
        "kind": config[0],
        "active": task.payload.get("active"),
        "changed": changed,
        "verified": True,
    }
    if normalized != expected:
        return _invalid_confirmation(response, uncertain)
    return BrowserTaskExecutionResult(
        status=BrowserTaskStatus.SUCCEEDED,
        message=_message(response, "互动状态已确认"),
        result=normalized,
    )


def _invalid_confirmation(
    response: dict[str, Any],
    uncertain: bool,
) -> BrowserTaskExecutionResult:
    if uncertain:
        return _needs_review(
            "互动操作已触发，但核验结果与原任务不一致，请人工核对",
            response.get("result"),
        )
    return _failed(
        "页面返回的互动状态与原任务不一致，未执行任何操作",
        response.get("result"),
    )


def _message(value: dict[str, Any], default: str) -> str:
    message = value.get("message")
    return message[:1000] if isinstance(message, str) and message else default


def _failed(message: str, result: Any = None) -> BrowserTaskExecutionResult:
    return BrowserTaskExecutionResult(
        status=BrowserTaskStatus.FAILED,
        message=message,
        result=result if isinstance(result, dict) else None,
    )


def _needs_review(
    message: str,
    result: Any = None,
) -> BrowserTaskExecutionResult:
    return BrowserTaskExecutionResult(
        status=BrowserTaskStatus.NEEDS_REVIEW,
        message=message,
        result=result if isinstance(result, dict) else None,
    )
