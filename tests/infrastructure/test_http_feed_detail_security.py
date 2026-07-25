"""Cookie HTTP 详情 Provider 的网络安全与错误映射测试。"""

import json
from pathlib import Path

import httpx
import pytest
from xhs_adapters import HttpFeedDetailProvider
from xhs_adapters.config import AppSettings
from xhs_core.domain import ProviderError, ProviderFailureCode, ProviderKind

FEED_ID = "synthetic-feed"
SECRET_TOKEN = "secret-query-token"
SECRET_COOKIE = "session=secret-cookie"


def _html() -> str:
    state = {
        "note": {
            "noteDetailMap": {
                FEED_ID: {
                    "note": {
                        "noteId": FEED_ID,
                        "type": "normal",
                        "user": {"userId": "synthetic-author"},
                    }
                }
            }
        }
    }
    script = json.dumps(state)
    return f"<script>window.__INITIAL_STATE__={script}</script>"


def _provider(
    tmp_path: Path,
    handler,
    *,
    max_retry: int = 0,
) -> HttpFeedDetailProvider:
    settings = AppSettings(
        work_path=tmp_path,
        cookie=SECRET_COOKIE,
        max_retry=max_retry,
    )
    return HttpFeedDetailProvider(
        settings,
        transport=httpx.MockTransport(handler),
    )


@pytest.mark.parametrize(
    "target",
    [
        "https://malicious.invalid/collect",
        "//malicious.invalid/collect",
        "http://www.xiaohongshu.com/explore/synthetic-feed",
        "https://www.xiaohongshu.com:444/explore/synthetic-feed",
        "https://www.xiaohongshu.com.evil.invalid/collect",
        "https://user@www.xiaohongshu.com/explore/synthetic-feed",
    ],
)
async def test_cross_origin_redirect_is_rejected_before_cookie_leaves_origin(
    tmp_path: Path,
    target: str,
) -> None:
    """确保异常跳转不会收到第二次请求或 Cookie。

    Args:
        tmp_path: Pytest 提供的临时目录。
        target: 不受信任的合成跳转地址。
    """
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(302, headers={"Location": target})

    async with _provider(tmp_path, handler) as provider:
        with pytest.raises(ProviderError) as captured:
            await provider.get_feed_detail(FEED_ID, SECRET_TOKEN)

    assert len(requests) == 1
    assert requests[0].url.host == "www.xiaohongshu.com"
    assert requests[0].headers["Cookie"] == SECRET_COOKIE
    assert captured.value.code is ProviderFailureCode.PAGE_INCOMPATIBLE
    assert target not in str(captured.value)
    assert SECRET_TOKEN not in str(captured.value)
    assert SECRET_COOKIE not in str(captured.value)


async def test_same_origin_redirect_keeps_cookie_and_can_complete(
    tmp_path: Path,
) -> None:
    """确保主站内跳转逐跳校验后仍可完成解析。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if len(requests) == 1:
            return httpx.Response(
                302,
                headers={"Location": "/explore/redirected"},
            )
        return httpx.Response(200, text=_html())

    async with _provider(tmp_path, handler) as provider:
        detail = await provider.get_feed_detail(FEED_ID, SECRET_TOKEN)

    assert detail.feed_id == FEED_ID
    assert len(requests) == 2
    assert {request.url.host for request in requests} == {"www.xiaohongshu.com"}
    assert {request.headers["Cookie"] for request in requests} == {SECRET_COOKIE}


@pytest.mark.parametrize(
    "response",
    [
        httpx.Response(302, headers={"Location": "/login"}),
        httpx.Response(
            200,
            text='<section class="login-container"><img></section>',
        ),
        httpx.Response(401),
        httpx.Response(403),
    ],
)
async def test_expired_authentication_has_stable_classification(
    tmp_path: Path,
    response: httpx.Response,
) -> None:
    """确保登录跳转、登录页和鉴权状态码统一映射为登录过期。

    Args:
        tmp_path: Pytest 提供的临时目录。
        response: 合成 HTTP 响应。
    """

    def handler(request: httpx.Request) -> httpx.Response:
        return response

    async with _provider(tmp_path, handler) as provider:
        with pytest.raises(ProviderError) as captured:
            await provider.get_feed_detail(FEED_ID, SECRET_TOKEN)

    assert captured.value.provider is ProviderKind.HTTP
    assert captured.value.code is ProviderFailureCode.AUTHENTICATION_EXPIRED
    assert SECRET_TOKEN not in str(captured.value)
    assert SECRET_COOKIE not in str(captured.value)


@pytest.mark.parametrize(
    ("status", "code"),
    [
        (404, ProviderFailureCode.UNAVAILABLE),
        (408, ProviderFailureCode.TIMEOUT_BEFORE_EFFECT),
        (410, ProviderFailureCode.UNAVAILABLE),
        (429, ProviderFailureCode.UNAVAILABLE),
        (500, ProviderFailureCode.UNAVAILABLE),
        (503, ProviderFailureCode.UNAVAILABLE),
    ],
)
async def test_http_statuses_map_to_provider_failures(
    tmp_path: Path,
    status: int,
    code: ProviderFailureCode,
) -> None:
    """确保 HTTP 状态码转换为稳定、可安全回退的失败。

    Args:
        tmp_path: Pytest 提供的临时目录。
        status: 合成响应状态码。
        code: 预期失败分类。
    """

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(status)

    async with _provider(tmp_path, handler) as provider:
        with pytest.raises(ProviderError) as captured:
            await provider.get_feed_detail(FEED_ID, SECRET_TOKEN)

    assert captured.value.code is code
    assert captured.value.safe_to_fallback is True


async def test_non_transient_status_is_not_retried(tmp_path: Path) -> None:
    """确保确定性的客户端状态不会消耗重试等待。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    attempts = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal attempts
        attempts += 1
        return httpx.Response(404)

    async with _provider(tmp_path, handler, max_retry=3) as provider:
        with pytest.raises(ProviderError):
            await provider.get_feed_detail(FEED_ID, SECRET_TOKEN)

    assert attempts == 1


@pytest.mark.parametrize(
    ("exception_type", "code"),
    [
        (httpx.ReadTimeout, ProviderFailureCode.TIMEOUT_BEFORE_EFFECT),
        (httpx.ConnectError, ProviderFailureCode.UNAVAILABLE),
    ],
)
async def test_transport_failures_are_redacted(
    tmp_path: Path,
    exception_type: type[httpx.RequestError],
    code: ProviderFailureCode,
) -> None:
    """确保网络异常被分类且不会通过异常链泄漏请求 URL。

    Args:
        tmp_path: Pytest 提供的临时目录。
        exception_type: HTTPX 合成异常类型。
        code: 预期失败分类。
    """

    def handler(request: httpx.Request) -> httpx.Response:
        raise exception_type("synthetic transport failure", request=request)

    async with _provider(tmp_path, handler) as provider:
        with pytest.raises(ProviderError) as captured:
            await provider.get_feed_detail(FEED_ID, SECRET_TOKEN)

    assert captured.value.code is code
    assert captured.value.__cause__ is None
    assert SECRET_TOKEN not in str(captured.value)
    assert SECRET_TOKEN not in repr(captured.value)
    assert SECRET_COOKIE not in str(captured.value)


async def test_redirect_loop_and_oversized_page_are_rejected(
    tmp_path: Path,
) -> None:
    """确保循环跳转与超限响应不会进入页面解析。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    looping = True

    def handler(request: httpx.Request) -> httpx.Response:
        if looping:
            return httpx.Response(302, headers={"Location": str(request.url)})
        return httpx.Response(
            200,
            headers={"Content-Length": str(11 * 1024 * 1024)},
            content=b"small synthetic body",
        )

    async with _provider(tmp_path, handler) as provider:
        with pytest.raises(ProviderError) as loop_error:
            await provider.get_feed_detail(FEED_ID, SECRET_TOKEN)
        looping = False
        with pytest.raises(ProviderError) as size_error:
            await provider.get_feed_detail(FEED_ID, SECRET_TOKEN)

    assert loop_error.value.code is ProviderFailureCode.PAGE_INCOMPATIBLE
    assert size_error.value.code is ProviderFailureCode.PAGE_INCOMPATIBLE
