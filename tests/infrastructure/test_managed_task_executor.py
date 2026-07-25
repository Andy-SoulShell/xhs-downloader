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


@pytest.mark.parametrize(
    ("task", "message"),
    [
        (
            synthetic_browser_task(
                BrowserTaskKind.LIST_FEEDS,
                driver=BrowserDriver.EXTENSION,
            ),
            "没有固定到受管浏览器驱动",
        ),
        (
            synthetic_browser_task(
                BrowserTaskKind.SET_LIKE,
                {
                    "feed_id": "synthetic-feed",
                    "xsec_token": "synthetic-token",
                    "active": True,
                },
            ),
            "尚未支持此任务",
        ),
    ],
)
async def test_executor_explicitly_rejects_wrong_driver_and_write_task(
    task: BrowserTask,
    message: str,
) -> None:
    """确保扩展目标与尚未支持的写任务明确失败且不连接页面。

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
