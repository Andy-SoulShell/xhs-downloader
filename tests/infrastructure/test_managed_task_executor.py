"""受管浏览器页面任务执行器基础设施测试。"""

import pytest
from xhs_adapters.managed_task_executor import PlaywrightManagedTaskExecutor
from xhs_core.domain import (
    BrowserDriver,
    BrowserTask,
    BrowserTaskKind,
    BrowserTaskStatus,
    ManagedBrowserError,
    ManagedBrowserState,
)

from tests.infrastructure.managed_page_fakes import (
    FakeController,
    FakePage,
    FakeSession,
    successful_page_response,
    synthetic_browser_status,
    synthetic_browser_task,
)

_CDP_PORT = 19222


async def test_executor_rejects_task_when_managed_browser_is_stopped() -> None:
    """确保停止状态不会创建或连接页面会话。"""
    controller = FakeController(synthetic_browser_status(ManagedBrowserState.STOPPED))
    session = FakeSession()
    executor = PlaywrightManagedTaskExecutor(controller, lambda: session)

    with pytest.raises(ManagedBrowserError, match="尚未运行"):
        await executor.execute(synthetic_browser_task(BrowserTaskKind.LIST_FEEDS))

    assert controller.status_calls == 1
    assert session.connected_ports == []
    assert session.new_page_calls == 0


async def test_login_status_reuses_existing_xhs_page() -> None:
    """确保登录检查复用现有小红书页面和持久化会话。"""
    existing = FakePage(
        "https://www.xiaohongshu.com/explore",
        responses=[
            successful_page_response(
                {
                    "logged_in": True,
                    "user_id": "synthetic-user",
                    "nickname": "合成账号",
                }
            )
        ],
    )
    session = FakeSession(
        existing_pages=[
            FakePage("https://synthetic.invalid/"),
            existing,
        ]
    )
    executor = PlaywrightManagedTaskExecutor(
        FakeController(synthetic_browser_status(cdp_port=_CDP_PORT)),
        lambda: session,
    )

    outcome = await executor.execute(
        synthetic_browser_task(BrowserTaskKind.CHECK_LOGIN_STATUS)
    )

    assert outcome.status is BrowserTaskStatus.SUCCEEDED
    assert outcome.result == {
        "logged_in": True,
        "user_id": "synthetic-user",
        "nickname": "合成账号",
    }
    assert session.connected_ports == [_CDP_PORT]
    assert session.new_page_calls == 0
    assert existing.goto_calls == []
    assert existing.closed is False
    assert session.closed is True


async def test_qrcode_page_stays_open_and_is_brought_to_front() -> None:
    """确保未登录二维码页面保留并置于用户前台。"""
    page = FakePage(
        responses=[
            successful_page_response(
                {
                    "is_logged_in": False,
                    "image_data_url": "data:image/png;base64,aGVsbG8=",
                    "expires_at": "2026-01-01T00:04:00Z",
                    "consumed": False,
                }
            )
        ],
    )
    session = FakeSession(task_page=page)
    executor = PlaywrightManagedTaskExecutor(
        FakeController(synthetic_browser_status(cdp_port=_CDP_PORT)),
        lambda: session,
    )

    outcome = await executor.execute(
        synthetic_browser_task(BrowserTaskKind.GET_LOGIN_QRCODE)
    )

    assert outcome.status is BrowserTaskStatus.SUCCEEDED
    assert outcome.result
    assert outcome.result["is_logged_in"] is False
    assert page.goto_calls[0][0] == "https://www.xiaohongshu.com/explore/"
    assert page.bring_to_front_calls == 1
    assert page.closed is False
    assert session.closed is True


async def test_cookie_deletion_closes_only_xhs_pages_and_returns_typed_result() -> None:
    """确保受管 Cookie 清理不创建页面并关闭所有小红书站点页面。"""
    main_page = FakePage("https://www.xiaohongshu.com/explore")
    creator_page = FakePage("https://creator.xiaohongshu.com/publish")
    root_page = FakePage("http://xiaohongshu.com/")
    unrelated_page = FakePage("https://synthetic.invalid/")
    deceptive_page = FakePage("https://xiaohongshu.com.synthetic.invalid/")
    session = FakeSession(
        existing_pages=[
            main_page,
            creator_page,
            root_page,
            unrelated_page,
            deceptive_page,
        ]
    )
    executor = PlaywrightManagedTaskExecutor(
        FakeController(synthetic_browser_status(cdp_port=_CDP_PORT)),
        lambda: session,
    )

    outcome = await executor.execute(
        synthetic_browser_task(
            BrowserTaskKind.DELETE_COOKIES,
            {"confirmed": True},
        )
    )

    assert outcome.status is BrowserTaskStatus.SUCCEEDED
    assert outcome.result == {"target": "browser", "deleted": True}
    assert session.delete_cookie_calls == 1
    assert session.new_page_calls == 0
    assert main_page.closed is True
    assert creator_page.closed is True
    assert root_page.closed is True
    assert unrelated_page.closed is False
    assert deceptive_page.closed is False
    assert session.closed is True


async def test_cookie_deletion_failure_is_safe_and_does_not_leak_error() -> None:
    """确保清理失败明确可重试且不会回传异常中的敏感内容。"""
    session = FakeSession(delete_cookie_error=RuntimeError("session=synthetic-secret"))
    executor = PlaywrightManagedTaskExecutor(
        FakeController(synthetic_browser_status(cdp_port=_CDP_PORT)),
        lambda: session,
    )

    outcome = await executor.execute(
        synthetic_browser_task(
            BrowserTaskKind.DELETE_COOKIES,
            {"confirmed": True},
        )
    )

    assert outcome.status is BrowserTaskStatus.FAILED
    assert outcome.result is None
    assert "安全重试" in outcome.message
    assert "synthetic-secret" not in outcome.message
    assert session.delete_cookie_calls == 1
    assert session.new_page_calls == 0
    assert session.closed is True


@pytest.mark.parametrize(
    ("session", "message"),
    [
        (
            FakeSession(pages_error=RuntimeError("synthetic-page-secret")),
            "页面状态读取失败",
        ),
        (
            FakeSession(
                existing_pages=[
                    FakePage(
                        "https://creator.xiaohongshu.com/publish",
                        close_error=RuntimeError("synthetic-close-secret"),
                    )
                ]
            ),
            "页面未能全部关闭",
        ),
    ],
)
async def test_cookie_deletion_page_cleanup_failures_are_safe(
    session: FakeSession,
    message: str,
) -> None:
    """确保 Cookie 已清理后的页面清理异常仍返回可安全重试。

    Args:
        session: 模拟页面读取或关闭异常的会话。
        message: 预期的脱敏失败摘要。
    """
    executor = PlaywrightManagedTaskExecutor(
        FakeController(synthetic_browser_status(cdp_port=_CDP_PORT)),
        lambda: session,
    )

    outcome = await executor.execute(
        synthetic_browser_task(
            BrowserTaskKind.DELETE_COOKIES,
            {"confirmed": True},
        )
    )

    assert outcome.status is BrowserTaskStatus.FAILED
    assert message in outcome.message
    assert "secret" not in outcome.message
    assert session.delete_cookie_calls == 1
    assert session.closed is True


@pytest.mark.parametrize(
    ("task", "message"),
    [
        (
            synthetic_browser_task(
                BrowserTaskKind.SET_LIKE,
                {
                    "feed_id": "synthetic-feed",
                    "xsec_token": "synthetic-token",
                    "active": True,
                },
                driver=BrowserDriver.EXTENSION,
            ),
            "没有固定到受管浏览器驱动",
        ),
        (
            synthetic_browser_task(
                BrowserTaskKind.POST_COMMENT,
                {
                    "feed_id": "synthetic-feed",
                    "xsec_token": "synthetic-token",
                    "content": "合成评论",
                },
            ),
            "尚未支持此任务",
        ),
    ],
)
async def test_executor_explicitly_rejects_wrong_driver_and_unsupported_task(
    task: BrowserTask,
    message: str,
) -> None:
    """确保扩展目标与尚未支持的任务明确失败且不连接页面。

    Args:
        task: 合成的错误驱动或写操作任务。
        message: 预期的安全失败摘要片段。
    """
    controller = FakeController(synthetic_browser_status(cdp_port=_CDP_PORT))
    session = FakeSession()
    executor = PlaywrightManagedTaskExecutor(controller, lambda: session)

    outcome = await executor.execute(task)

    assert outcome.status is BrowserTaskStatus.FAILED
    assert message in outcome.message
    assert controller.status_calls == 0
    assert session.connected_ports == []


async def test_executor_requires_task_to_enter_running_before_execution() -> None:
    """确保尚未进入运行态的受管任务不会连接浏览器。"""
    controller = FakeController(synthetic_browser_status(cdp_port=_CDP_PORT))
    session = FakeSession()
    executor = PlaywrightManagedTaskExecutor(controller, lambda: session)
    task = synthetic_browser_task(
        BrowserTaskKind.SET_LIKE,
        {
            "feed_id": "synthetic-feed",
            "xsec_token": "synthetic-token",
            "active": True,
        },
    ).model_copy(update={"status": BrowserTaskStatus.CLAIMED})

    outcome = await executor.execute(task)

    assert outcome.status is BrowserTaskStatus.FAILED
    assert "运行态" in outcome.message
    assert controller.status_calls == 0
    assert session.connected_ports == []
