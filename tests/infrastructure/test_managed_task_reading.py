"""受管浏览器只读页面导航与解析测试。"""

from urllib.parse import parse_qs, urlsplit

import pytest
from pydantic import JsonValue
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


@pytest.mark.parametrize(
    ("kind", "payload", "expected_path", "expected_query", "source"),
    [
        (BrowserTaskKind.LIST_FEEDS, {}, "/explore/", {}, "home"),
        (
            BrowserTaskKind.SEARCH_FEEDS,
            {"keyword": "合成关键词"},
            "/search_result",
            {
                "keyword": ["合成关键词"],
                "source": ["web_explore_feed"],
            },
            "search",
        ),
        (
            BrowserTaskKind.GET_FEED_DETAIL,
            {
                "feed_id": "synthetic-feed",
                "xsec_token": "synthetic-xsec",
            },
            "/explore/synthetic-feed",
            {
                "xsec_token": ["synthetic-xsec"],
                "xsec_source": ["pc_feed"],
            },
            "detail",
        ),
        (
            BrowserTaskKind.GET_USER_PROFILE,
            {
                "user_id": "synthetic-user",
                "xsec_token": "synthetic-xsec",
            },
            "/user/profile/synthetic-user",
            {
                "xsec_token": ["synthetic-xsec"],
                "xsec_source": ["pc_note"],
            },
            "profile",
        ),
    ],
)
async def test_read_tasks_navigate_and_parse_successfully(
    kind: BrowserTaskKind,
    payload: dict[str, JsonValue],
    expected_path: str,
    expected_query: dict[str, list[str]],
    source: str,
) -> None:
    """确保推荐、搜索、详情和用户主页使用可信导航并解析成功。

    Args:
        kind: 待执行的只读任务类型。
        payload: 合成任务输入。
        expected_path: 预期的小红书站内路径。
        expected_query: 预期的结构化查询参数。
        source: 合成结果来源标识。
    """
    if kind in {BrowserTaskKind.LIST_FEEDS, BrowserTaskKind.SEARCH_FEEDS}:
        result = {
            "items": [],
            "source": source,
            "keyword": payload.get("keyword"),
            "has_more": False,
            "cursor": "",
        }
    elif kind is BrowserTaskKind.GET_FEED_DETAIL:
        result = {
            "feed_id": "synthetic-feed",
            "author": {"user_id": "synthetic-user"},
        }
    else:
        result = {
            "user_id": "synthetic-user",
            "nickname": "合成账号",
        }
    page = FakePage(responses=[successful_page_response(result)])
    session = FakeSession(task_page=page)
    executor = PlaywrightManagedTaskExecutor(
        FakeController(synthetic_browser_status()),
        lambda: session,
    )

    outcome = await executor.execute(synthetic_browser_task(kind, payload))

    target = urlsplit(page.goto_calls[0][0])
    assert target.scheme == "https"
    assert target.hostname == "www.xiaohongshu.com"
    assert target.path == expected_path
    assert parse_qs(target.query) == expected_query
    assert outcome.status is BrowserTaskStatus.SUCCEEDED
    assert outcome.result == result
    assert page.execute_args[0]["kind"] == kind.value
    assert page.closed is True
    assert session.closed is True


async def test_my_profile_follows_one_internal_navigation() -> None:
    """确保我的主页任务可按适配器指示完成一次站内二次导航。"""
    page = FakePage(
        responses=[
            {
                "ok": False,
                "message": "需要进入合成主页",
                "navigateUrl": (
                    "https://www.xiaohongshu.com/user/profile/synthetic-self"
                ),
            },
            successful_page_response(
                {
                    "user_id": "synthetic-self",
                    "nickname": "合成账号",
                }
            ),
        ]
    )
    session = FakeSession(task_page=page)
    executor = PlaywrightManagedTaskExecutor(
        FakeController(synthetic_browser_status()),
        lambda: session,
    )

    outcome = await executor.execute(
        synthetic_browser_task(BrowserTaskKind.GET_MY_PROFILE)
    )

    assert [urlsplit(call[0]).path for call in page.goto_calls] == [
        "/explore/",
        "/user/profile/synthetic-self",
    ]
    assert len(page.execute_args) == 2
    assert outcome.status is BrowserTaskStatus.SUCCEEDED
    assert outcome.result == {
        "user_id": "synthetic-self",
        "nickname": "合成账号",
    }
    assert page.closed is True


async def test_executor_rejects_external_adapter_navigation() -> None:
    """确保页面适配器不能诱导受管浏览器离开小红书主站。"""
    page = FakePage(
        responses=[
            {
                "ok": False,
                "message": "需要导航",
                "navigateUrl": "https://synthetic.invalid/redirect",
            }
        ]
    )
    session = FakeSession(task_page=page)
    executor = PlaywrightManagedTaskExecutor(
        FakeController(synthetic_browser_status()),
        lambda: session,
    )

    outcome = await executor.execute(
        synthetic_browser_task(BrowserTaskKind.GET_MY_PROFILE)
    )

    assert len(page.goto_calls) == 1
    assert urlsplit(page.goto_calls[0][0]).hostname == "www.xiaohongshu.com"
    assert outcome.status is BrowserTaskStatus.FAILED
    assert outcome.message == "受管浏览器页面执行失败"
    assert outcome.result == page.diagnostics
    assert page.diagnostics_count == 1
    assert page.closed is True
