"""受管发布点击前后失败分类与严格响应校验测试。"""

from pathlib import Path
from typing import Any

import pytest
from xhs_adapters.managed_publication import (
    PUBLISH_SELECTOR,
    PlaywrightManagedPublicationExecutor,
)
from xhs_core.domain import (
    ManagedPublicationProgress,
    PublicationTaskStatus,
)

from tests.infrastructure.managed_page_fakes import (
    FakeController,
    synthetic_browser_status,
)
from tests.infrastructure.managed_publication_fakes import (
    FakePublicationPage,
    FakePublicationSession,
)
from tests.infrastructure.managed_publication_scenarios import (
    PENDING_RESPONSE,
    PUBLISHED_RESPONSE,
    native_publication_responses,
    synthetic_publication_task,
)


@pytest.mark.parametrize(
    ("failure", "replacement"),
    [
        (
            "upload",
            {
                "ok": True,
                "message": "创作页素材入口已准备",
                "action": "upload",
                "mediaKind": "image",
                "selector": "input[type=file]",
            },
        ),
        (
            "fill",
            {"ok": True, "message": "页面声称已经填充但缺少严格协议"},
        ),
        (
            "prepare_publish",
            {
                "ok": True,
                "message": "原生发布按钮已核验",
                "action": "click_selector",
                "selector": "button",
            },
        ),
    ],
)
async def test_malformed_pre_click_response_fails_without_platform_write(
    tmp_path: Path,
    failure: str,
    replacement: dict[str, object],
) -> None:
    """确保页面不能通过未知选择器或响应绕过可信输入边界。

    Args:
        tmp_path: Pytest 提供的合成素材目录。
        failure: 被替换的页面协议阶段。
        replacement: 包含无效动作的合成响应。
    """
    task, paths = synthetic_publication_task(tmp_path, "image")
    responses = native_publication_responses(
        "image",
        observe=[PENDING_RESPONSE],
    )
    responses[failure] = [replacement]
    page = FakePublicationPage(responses=responses)
    session = FakePublicationSession(page)

    outcome = await _executor(session).execute(task, paths, _ignore_progress)

    assert outcome.status is PublicationTaskStatus.FAILED
    assert page.click_calls == []
    assert page.mouse.clicks == []


async def test_stale_success_before_click_cannot_impersonate_current_task(
    tmp_path: Path,
) -> None:
    """确保点击前残留成功提示会中止任务而不是冒充本次发布。

    Args:
        tmp_path: Pytest 提供的合成素材目录。
    """
    task, paths = synthetic_publication_task(tmp_path, "image")
    responses = native_publication_responses(
        "image",
        observe=[PUBLISHED_RESPONSE],
    )
    page = FakePublicationPage(responses=responses)
    session = FakePublicationSession(page)

    outcome = await _executor(session).execute(task, paths, _ignore_progress)

    assert outcome.status is PublicationTaskStatus.FAILED
    assert page.click_calls == []


async def test_atomic_progress_failure_prevents_publish_click(tmp_path: Path) -> None:
    """确保安全标记持久化失败时绝不执行发布点击。

    Args:
        tmp_path: Pytest 提供的合成素材目录。
    """
    task, paths = synthetic_publication_task(tmp_path, "image")
    responses = native_publication_responses(
        "image",
        observe=[PENDING_RESPONSE],
    )
    page = FakePublicationPage(responses=responses)
    session = FakePublicationSession(page)

    async def reject_progress(progress: ManagedPublicationProgress) -> None:
        assert progress.status is PublicationTaskStatus.PUBLISHING
        raise RuntimeError("synthetic persistence secret")

    outcome = await _executor(session).execute(task, paths, reject_progress)

    assert outcome.status is PublicationTaskStatus.FAILED
    assert "secret" not in outcome.message
    assert page.click_calls == []


@pytest.mark.parametrize("replacement", [b"changed-size", b"synthetic-9"])
async def test_asset_changed_before_upload_fails_without_platform_write(
    tmp_path: Path,
    replacement: bytes,
) -> None:
    """确保素材在上传预检期间被替换时不会送入浏览器。

    Args:
        tmp_path: Pytest 提供的合成素材目录。
        replacement: 大小变化或保持相同大小的替换内容。
    """
    task, paths = synthetic_publication_task(tmp_path, "image")
    responses = native_publication_responses(
        "image",
        observe=[PENDING_RESPONSE],
    )
    upload_response = responses["upload"][0]

    def replace_asset() -> dict[str, object]:
        paths[0].write_bytes(replacement)
        return upload_response

    responses["upload"] = [replace_asset]
    page = FakePublicationPage(responses=responses)
    session = FakePublicationSession(page)

    outcome = await _executor(session).execute(task, paths, _ignore_progress)

    assert outcome.status is PublicationTaskStatus.FAILED
    assert page.file_calls == []
    assert page.click_calls == []


@pytest.mark.parametrize(
    "failure",
    ["click", "observe_error", "malformed", "untrusted_url", "timeout"],
)
async def test_post_click_uncertainty_always_requires_manual_review(
    tmp_path: Path,
    failure: str,
) -> None:
    """确保发布输入开始后的异常、畸形响应和超时都进入人工核对。

    Args:
        tmp_path: Pytest 提供的合成素材目录。
        failure: 发布点击或观察阶段的合成故障。
    """
    task, paths = synthetic_publication_task(tmp_path, "image")
    after_click: list[Any]
    if failure == "observe_error":
        after_click = [RuntimeError("synthetic page secret")]
    elif failure == "malformed":
        after_click = [{"ok": True, "state": {"unexpected": True}}]
    elif failure == "untrusted_url":
        after_click = [
            {
                "ok": True,
                "state": "published",
                "message": "创作平台已确认发布成功",
                "resultUrl": "https://synthetic.invalid/explore/untrusted",
            }
        ]
    else:
        after_click = []
    responses = native_publication_responses(
        "image",
        observe=[PENDING_RESPONSE, *after_click],
    )
    click_error = RuntimeError("synthetic click secret") if failure == "click" else None
    page = FakePublicationPage(responses=responses, click_error=click_error)
    session = FakePublicationSession(page)

    outcome = await _executor(session).execute(task, paths, _ignore_progress)

    assert outcome.status is PublicationTaskStatus.NEEDS_REVIEW
    assert "secret" not in outcome.message
    assert page.click_calls == [(PUBLISH_SELECTOR, {"strict": True, "timeout": 5_000})]


async def test_explicit_platform_failure_is_a_confirmed_failed_outcome(
    tmp_path: Path,
) -> None:
    """确保平台明确失败与未知结果保持不同终态。

    Args:
        tmp_path: Pytest 提供的合成素材目录。
    """
    task, paths = synthetic_publication_task(tmp_path, "image")
    failed = {
        "ok": True,
        "state": "failed",
        "message": "创作平台明确报告发布失败",
    }
    responses = native_publication_responses(
        "image",
        observe=[PENDING_RESPONSE, failed],
    )
    page = FakePublicationPage(responses=responses)
    session = FakePublicationSession(page)

    outcome = await _executor(session).execute(task, paths, _ignore_progress)

    assert outcome.status is PublicationTaskStatus.FAILED
    assert outcome.message == "创作平台明确报告发布失败"
    assert len(page.click_calls) == 1


@pytest.mark.parametrize(
    ("page_options", "expected"),
    [
        (
            {"navigated_url": "https://synthetic.invalid/publish"},
            PublicationTaskStatus.FAILED,
        ),
        (
            {"adapter_version": "2"},
            PublicationTaskStatus.FAILED,
        ),
    ],
)
async def test_untrusted_navigation_or_adapter_version_fails_before_input(
    tmp_path: Path,
    page_options: dict[str, Any],
    expected: PublicationTaskStatus,
) -> None:
    """确保站外跳转和协议版本漂移不会接触素材或发布控件。

    Args:
        tmp_path: Pytest 提供的合成素材目录。
        page_options: 合成页面初始化覆盖项。
        expected: 预期安全失败状态。
    """
    task, paths = synthetic_publication_task(tmp_path, "image")
    page = FakePublicationPage(responses={}, **page_options)
    session = FakePublicationSession(page)

    outcome = await _executor(session).execute(task, paths, _ignore_progress)

    assert outcome.status is expected
    assert page.file_calls == []
    assert page.click_calls == []


def _executor(
    session: FakePublicationSession,
) -> PlaywrightManagedPublicationExecutor:
    return PlaywrightManagedPublicationExecutor(
        FakeController(synthetic_browser_status()),
        lambda: session,
        observation_timeout=0.005,
        poll_interval=0.001,
    )


async def _ignore_progress(_progress: ManagedPublicationProgress) -> None:
    return None
