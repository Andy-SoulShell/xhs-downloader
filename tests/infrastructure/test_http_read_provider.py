"""Cookie HTTP 统一读取 Provider 测试。"""

import json
from pathlib import Path
from urllib.parse import parse_qs

import httpx
import pytest
from xhs_adapters import HttpReadProvider
from xhs_adapters.config import AppSettings
from xhs_core.domain import ProviderError, ProviderFailureCode, ProviderKind
from xhs_core.domain.browser_requests import SearchFilters

_COOKIE = "session=synthetic-cookie"


def _feed() -> dict:
    return {
        "id": "synthetic-feed",
        "xsecToken": "synthetic-token",
        "noteCard": {
            "type": "normal",
            "displayTitle": "合成 Feed",
            "user": {"userId": "synthetic-author"},
        },
    }


def _profile_state(user_id: str) -> dict:
    return {
        "user": {
            "userPageData": {
                "value": {
                    "basicInfo": {
                        "userId": user_id,
                        "nickname": "合成用户",
                    },
                    "interactions": [],
                }
            },
            "notes": {"value": []},
        }
    }


def _html(state: dict) -> str:
    script = json.dumps(state, ensure_ascii=False)
    return f"<script>window.__INITIAL_STATE__={script}</script>"


def _provider(
    tmp_path: Path,
    handler,
    *,
    cookie: str = _COOKIE,
) -> HttpReadProvider:
    settings = AppSettings(
        work_path=tmp_path,
        cookie=cookie,
        max_retry=0,
    )
    return HttpReadProvider(
        settings,
        transport=httpx.MockTransport(handler),
    )


async def test_list_feeds_uses_trusted_explore_page(tmp_path: Path) -> None:
    """确保推荐读取只访问主站探索页并携带本地 Cookie。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        state = {"feed": {"feeds": {"value": [_feed()]}}}
        return httpx.Response(200, text=_html(state))

    async with _provider(tmp_path, handler) as provider:
        result = await provider.list_feeds()

    assert [item.feed_id for item in result.items] == ["synthetic-feed"]
    assert len(requests) == 1
    assert requests[0].url == "https://www.xiaohongshu.com/explore/"
    assert requests[0].headers["Cookie"] == _COOKIE


async def test_search_encodes_keyword_and_accepts_only_default_filters(
    tmp_path: Path,
) -> None:
    """确保默认筛选搜索编码关键词并核对页面状态。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    requests: list[httpx.Request] = []
    keyword = "合成 / 关键词&"

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        state = {
            "search": {
                "keyword": {"value": keyword},
                "feeds": {"_value": [_feed()]},
            }
        }
        return httpx.Response(200, text=_html(state))

    async with _provider(tmp_path, handler) as provider:
        result = await provider.search_feeds(keyword, SearchFilters())

    assert result.keyword == keyword
    assert [request.url.path for request in requests] == [
        "/explore/",
        "/search_result/",
    ]
    assert parse_qs(requests[1].url.query.decode()) == {
        "keyword": [keyword],
        "source": ["web_explore_feed"],
    }


async def test_custom_search_filters_check_session_before_browser_fallback(
    tmp_path: Path,
) -> None:
    """确保需 DOM 交互的筛选先确认 Cookie 会话仍然有效。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        state = {
            "user": {
                "userInfo": {"value": {"guest": False, "userId": "synthetic-current"}}
            }
        }
        return httpx.Response(200, text=_html(state))

    async with _provider(tmp_path, handler) as provider:
        with pytest.raises(ProviderError) as captured:
            await provider.search_feeds(
                "合成关键词",
                SearchFilters(sort_by="最新"),
            )

    assert [request.url.path for request in requests] == ["/explore/"]
    assert captured.value.provider is ProviderKind.HTTP
    assert captured.value.code is ProviderFailureCode.UNSUPPORTED


async def test_user_profile_encodes_inputs_and_verifies_identity(
    tmp_path: Path,
) -> None:
    """确保用户 ID 和令牌安全编码，且结果属于目标用户。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    requests: list[httpx.Request] = []
    user_id = "synthetic/user"
    token = "secret profile&token"

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, text=_html(_profile_state(user_id)))

    async with _provider(tmp_path, handler) as provider:
        result = await provider.get_user_profile(user_id, token)

    assert result.user_id == user_id
    assert len(requests) == 2
    assert requests[1].url.raw_path.split(b"?", 1)[0] == (
        b"/user/profile/synthetic%2Fuser"
    )
    assert parse_qs(requests[1].url.query.decode()) == {
        "xsec_token": [token],
        "xsec_source": ["pc_note"],
    }
    assert token not in repr(result)


@pytest.mark.parametrize("wrapper", ["value", "_value"])
async def test_my_profile_requires_strict_account_then_loads_profile(
    tmp_path: Path,
    wrapper: str,
) -> None:
    """确保当前主页先从推荐页确认已登录身份，再访问同一账号。

    Args:
        tmp_path: Pytest 提供的临时目录。
        wrapper: 当前账号信息采用的状态包装字段。
    """
    requests: list[httpx.Request] = []
    user_id = "synthetic-current"

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if request.url.path == "/explore/":
            state = {
                "user": {"userInfo": {wrapper: {"guest": False, "userId": user_id}}}
            }
        else:
            state = _profile_state(user_id)
        return httpx.Response(200, text=_html(state))

    async with _provider(tmp_path, handler) as provider:
        result = await provider.get_my_profile()

    assert result.user_id == user_id
    assert [request.url.path for request in requests] == [
        "/explore/",
        f"/user/profile/{user_id}",
    ]
    assert requests[1].url.query == b""


async def test_my_profile_without_strict_identity_is_structured_gap(
    tmp_path: Path,
) -> None:
    """确保推荐页未明确声明登录身份时不猜测账号或二次请求。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        state = {"user": {"userInfo": {"value": {"userId": "stale"}}}}
        return httpx.Response(200, text=_html(state))

    async with _provider(tmp_path, handler) as provider:
        with pytest.raises(ProviderError) as captured:
            await provider.get_my_profile()

    assert len(requests) == 1
    assert captured.value.code is ProviderFailureCode.UNSUPPORTED


@pytest.mark.parametrize(
    "operation",
    ["list", "search", "profile", "mine"],
)
async def test_missing_cookie_prevents_all_new_requests(
    tmp_path: Path,
    operation: str,
) -> None:
    """确保未配置 Cookie 时所有新增能力都不会发起请求。

    Args:
        tmp_path: Pytest 提供的临时目录。
        operation: 待调用的新增 HTTP 能力。
    """
    called = False

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal called
        called = True
        return httpx.Response(200)

    async with _provider(tmp_path, handler, cookie=" ") as provider:
        with pytest.raises(ProviderError) as captured:
            if operation == "list":
                await provider.list_feeds()
            elif operation == "search":
                await provider.search_feeds("合成", SearchFilters())
            elif operation == "profile":
                await provider.get_user_profile("synthetic-user", "token")
            else:
                await provider.get_my_profile()

    assert called is False
    assert captured.value.code is ProviderFailureCode.NOT_CONFIGURED


async def test_guest_state_maps_to_expired_cookie(tmp_path: Path) -> None:
    """确保高级筛选回退前把明确访客状态映射为登录过期。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    state = {"user": {"userInfo": {"value": {"guest": True}}}}

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text=_html(state))

    async with _provider(tmp_path, handler) as provider:
        with pytest.raises(ProviderError) as captured:
            await provider.search_feeds(
                "合成关键词",
                SearchFilters(sort_by="最新"),
            )

    assert captured.value.code is ProviderFailureCode.AUTHENTICATION_EXPIRED
