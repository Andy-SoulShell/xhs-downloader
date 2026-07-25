"""受管发布 Playwright 执行器成功路径与输入边界测试。"""

from pathlib import Path

import pytest
from xhs_adapters.managed_publication_contract import (
    PUBLISH_SELECTOR,
    SCHEDULE_SELECTOR,
    UPLOAD_SELECTOR,
)
from xhs_adapters.managed_publication_executor import (
    PlaywrightManagedPublicationExecutor,
)
from xhs_core.domain import (
    BrowserDriver,
    ManagedPublicationProgress,
    PublicationMode,
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


async def test_image_publication_uses_ordered_assets_and_atomic_click_boundary(
    tmp_path: Path,
) -> None:
    """确保图文发布按位置上传并在原子安全标记后只点击一次。

    Args:
        tmp_path: Pytest 提供的合成素材目录。
    """
    task, paths = synthetic_publication_task(tmp_path, "image", asset_count=2)
    page = FakePublicationPage(
        responses=native_publication_responses(
            "image",
            observe=[PENDING_RESPONSE, PUBLISHED_RESPONSE],
        )
    )
    session = FakePublicationSession(page)
    progresses: list[ManagedPublicationProgress] = []

    async def report(progress: ManagedPublicationProgress) -> None:
        progresses.append(progress)
        page.events.append(
            f"report:{progress.status.value}:{progress.publish_attempted}"
        )

    executor = PlaywrightManagedPublicationExecutor(
        FakeController(synthetic_browser_status()),
        lambda: session,
        observation_timeout=0.1,
        poll_interval=0.001,
    )

    outcome = await executor.execute(task, paths, report)

    assert outcome.status is PublicationTaskStatus.PUBLISHED
    assert outcome.result_url == PUBLISHED_RESPONSE["resultUrl"]
    assert page.events.index("add_init_script") < page.events.index("goto")
    assert page.goto_calls == [
        (
            "https://creator.xiaohongshu.com/publish/publish?target=image",
            {"wait_until": "domcontentloaded", "timeout": 30_000},
        )
    ]
    assert page.file_calls == [
        (
            UPLOAD_SELECTOR,
            tuple(str(path) for path in paths),
            {"strict": True, "timeout": 30_000},
        )
    ]
    assert page.click_calls == [(PUBLISH_SELECTOR, {"strict": True, "timeout": 5_000})]
    report_index = page.events.index("report:publishing:True")
    assert report_index < page.events.index("click:publish")
    assert [(item.status, item.publish_attempted) for item in progresses] == [
        (PublicationTaskStatus.PUBLISHING, True)
    ]
    assert page.closed is True
    assert session.closed is True


async def test_video_publication_activates_focused_shadow_button(
    tmp_path: Path,
) -> None:
    """确保视频发布通过可信键盘输入激活已聚焦的真实按钮。

    Args:
        tmp_path: Pytest 提供的合成素材目录。
    """
    task, paths = synthetic_publication_task(tmp_path, "video")
    captured = {
        "ok": True,
        "message": "封闭发布按钮已准备",
        "action": "activate_focused",
    }
    responses = native_publication_responses(
        "video",
        observe=[PENDING_RESPONSE, PUBLISHED_RESPONSE],
    )
    responses["prepare_publish"] = [captured, captured]
    page = FakePublicationPage(responses=responses)
    session = FakePublicationSession(page)
    executor = PlaywrightManagedPublicationExecutor(
        FakeController(synthetic_browser_status()),
        lambda: session,
        observation_timeout=0.1,
        poll_interval=0.001,
    )

    outcome = await executor.execute(task, paths, _ignore_progress)

    assert outcome.status is PublicationTaskStatus.PUBLISHED
    assert page.goto_calls[0][0].endswith("?target=video")
    assert page.mouse.clicks == []
    assert page.click_calls == []
    assert page.keyboard.presses == [("Space", {})]
    assert session.publish_activation_calls == 1
    prepare_calls = [
        expression
        for expression, _ in page.evaluate_calls
        if ".preparePublish(" in expression
    ]
    assert len(prepare_calls) == 2


async def test_captured_button_change_after_atomic_boundary_requires_review(
    tmp_path: Path,
) -> None:
    """确保原子边界后的按钮类型变化进入人工核对且不点击。

    Args:
        tmp_path: Pytest 提供的合成素材目录。
    """
    task, paths = synthetic_publication_task(tmp_path, "video")
    captured = {
        "ok": True,
        "message": "封闭发布按钮已准备",
        "action": "activate_focused",
    }
    native = {
        "ok": True,
        "message": "原生发布按钮已核验",
        "action": "click_selector",
        "selector": PUBLISH_SELECTOR,
    }
    responses = native_publication_responses(
        "video",
        observe=[PENDING_RESPONSE],
    )
    responses["prepare_publish"] = [captured, native]
    page = FakePublicationPage(responses=responses)
    outcome = await PlaywrightManagedPublicationExecutor(
        FakeController(synthetic_browser_status()),
        lambda: FakePublicationSession(page),
        observation_timeout=0.1,
        poll_interval=0.001,
    ).execute(task, paths, _ignore_progress)

    assert outcome.status is PublicationTaskStatus.NEEDS_REVIEW
    assert page.mouse.clicks == []
    assert page.click_calls == []


async def test_platform_schedule_uses_keyboard_and_strict_page_readback(
    tmp_path: Path,
) -> None:
    """确保官方定时只写入 Python 独立计算的北京时间并回读确认。

    Args:
        tmp_path: Pytest 提供的合成素材目录。
    """
    task, paths = synthetic_publication_task(
        tmp_path,
        "image",
        mode=PublicationMode.PLATFORM_SCHEDULED,
        original=True,
    )
    responses = native_publication_responses(
        "image",
        observe=[PENDING_RESPONSE, PUBLISHED_RESPONSE],
    )
    responses["fill"] = [
        {
            "ok": True,
            "message": "官方定时输入已准备",
            "action": "type_schedule",
            "selector": SCHEDULE_SELECTOR,
            "value": "2026-07-25 20:34",
        }
    ]
    responses["verify_schedule"] = [{"ok": True, "message": "官方定时时间已回读确认"}]
    page = FakePublicationPage(responses=responses)
    session = FakePublicationSession(page)
    executor = PlaywrightManagedPublicationExecutor(
        FakeController(synthetic_browser_status()),
        lambda: session,
        observation_timeout=0.1,
        poll_interval=0.001,
    )

    outcome = await executor.execute(task, paths, _ignore_progress)

    assert outcome.status is PublicationTaskStatus.PUBLISHED
    assert page.click_calls == [
        (SCHEDULE_SELECTOR, {"strict": True, "timeout": 30_000}),
        (PUBLISH_SELECTOR, {"strict": True, "timeout": 5_000}),
    ]
    assert page.keyboard.presses == [
        ("ControlOrMeta+A", {}),
        ("Tab", {}),
    ]
    assert page.keyboard.inserted_text == ["2026-07-25 20:34"]
    assert any("verifySchedule" in expression for expression, _ in page.evaluate_calls)


@pytest.mark.parametrize(
    "mutation",
    ["driver", "status", "attempted", "fingerprint", "asset_order"],
)
async def test_executor_rejects_invalid_task_before_connecting_browser(
    tmp_path: Path,
    mutation: str,
) -> None:
    """确保错误任务或素材顺序不会连接页面或产生平台输入。

    Args:
        tmp_path: Pytest 提供的合成素材目录。
        mutation: 待破坏的任务安全边界。
    """
    task, paths = synthetic_publication_task(tmp_path, "image", asset_count=2)
    if mutation == "driver":
        task = task.model_copy(update={"target_driver": BrowserDriver.EXTENSION})
    elif mutation == "status":
        task = task.model_copy(update={"status": PublicationTaskStatus.READY})
    elif mutation == "attempted":
        task = task.model_copy(update={"publish_attempted": True})
    elif mutation == "fingerprint":
        task = task.model_copy(update={"package_fingerprint": "0" * 64})
    else:
        paths = tuple(reversed(paths))
    page = FakePublicationPage(responses={})
    session = FakePublicationSession(page)
    controller = FakeController(synthetic_browser_status())
    executor = PlaywrightManagedPublicationExecutor(controller, lambda: session)

    outcome = await executor.execute(task, paths, _ignore_progress)

    assert outcome.status is PublicationTaskStatus.FAILED
    assert outcome.message == "受管浏览器发布点击前执行失败，可以安全重试"
    assert controller.status_calls == 0
    assert session.connected_ports == []
    assert page.click_calls == []


async def _ignore_progress(_progress: ManagedPublicationProgress) -> None:
    return None
