"""受管浏览器登录状态稳定性测试。"""

from xhs_adapters.managed_task_executor import PlaywrightManagedTaskExecutor
from xhs_core.domain import BrowserTaskKind, BrowserTaskStatus

from tests.infrastructure.managed_page_fakes import (
    FakeController,
    FakePage,
    FakeSession,
    successful_page_response,
    synthetic_browser_status,
    synthetic_browser_task,
)


async def test_login_status_waits_out_initial_logged_out_snapshot() -> None:
    """确保浏览器刚启动时不会把页面加载中的快照误报为退出登录。"""
    page = FakePage(
        "https://www.xiaohongshu.com/explore",
        responses=[
            successful_page_response(
                {"logged_in": False, "user_id": None, "nickname": None}
            ),
            successful_page_response(
                {
                    "logged_in": True,
                    "user_id": "synthetic-user",
                    "nickname": "合成账号",
                }
            ),
        ],
    )
    executor = PlaywrightManagedTaskExecutor(
        FakeController(synthetic_browser_status()),
        lambda: FakeSession(existing_pages=[page]),
    )

    outcome = await executor.execute(
        synthetic_browser_task(BrowserTaskKind.CHECK_LOGIN_STATUS)
    )

    assert outcome.status is BrowserTaskStatus.SUCCEEDED
    assert outcome.result
    assert outcome.result["logged_in"] is True
    assert len(page.execute_args) == 2


async def test_login_status_eventually_confirms_logged_out_snapshot() -> None:
    """确保稳定未登录页面在有限重试后仍返回明确结果。"""
    logged_out = successful_page_response(
        {"logged_in": False, "user_id": None, "nickname": None}
    )
    page = FakePage(
        "https://www.xiaohongshu.com/explore",
        responses=[logged_out for _ in range(20)],
    )
    executor = PlaywrightManagedTaskExecutor(
        FakeController(synthetic_browser_status()),
        lambda: FakeSession(existing_pages=[page]),
    )

    outcome = await executor.execute(
        synthetic_browser_task(BrowserTaskKind.CHECK_LOGIN_STATUS)
    )

    assert outcome.status is BrowserTaskStatus.SUCCEEDED
    assert outcome.result
    assert outcome.result["logged_in"] is False
    assert len(page.execute_args) == 20
