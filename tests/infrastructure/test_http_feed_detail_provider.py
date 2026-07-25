"""Cookie HTTP 详情 Provider 的成功路径与配置测试。"""

import json
from pathlib import Path
from urllib.parse import parse_qs

import httpx
import pytest
from xhs_adapters import HttpFeedDetailProvider
from xhs_adapters.config import AppSettings
from xhs_core.domain import ProviderError, ProviderFailureCode, ProviderKind


def _html(feed_id: str, *, xsec_token: str | None = None) -> str:
    note = {
        "noteId": feed_id,
        "title": "合成 HTTP 详情",
        "type": "normal",
        "user": {"userId": "synthetic-author"},
    }
    if xsec_token is not None:
        note["xsecToken"] = xsec_token
    state = {
        "note": {
            "noteDetailMap": {
                feed_id: {
                    "note": note,
                    "comments": {"value": {"list": []}},
                }
            }
        }
    }
    script = json.dumps(state, ensure_ascii=False)
    return f"<html><script>window.__INITIAL_STATE__={script}</script></html>"


def _provider(
    tmp_path: Path,
    handler,
    *,
    cookie: str = "session=synthetic-cookie",
    max_retry: int = 0,
) -> HttpFeedDetailProvider:
    settings = AppSettings(
        work_path=tmp_path,
        cookie=cookie,
        max_retry=max_retry,
    )
    return HttpFeedDetailProvider(
        settings,
        transport=httpx.MockTransport(handler),
    )


async def test_get_detail_encodes_inputs_and_returns_verified_result(
    tmp_path: Path,
) -> None:
    """确保请求固定在主站、编码路径令牌并忠实解析结果。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    requests: list[httpx.Request] = []
    feed_id = "synthetic/feed"
    token = "secret token&value"

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, text=_html(feed_id))

    async with _provider(tmp_path, handler) as provider:
        detail = await provider.get_feed_detail(feed_id, token)

    assert len(requests) == 1
    request = requests[0]
    assert request.url.scheme == "https"
    assert request.url.host == "www.xiaohongshu.com"
    assert request.url.port is None
    assert request.url.raw_path.split(b"?", 1)[0] == b"/explore/synthetic%2Ffeed"
    assert parse_qs(request.url.query.decode()) == {
        "xsec_token": [token],
        "xsec_source": ["pc_feed"],
    }
    assert request.headers["Cookie"] == "session=synthetic-cookie"
    assert request.headers["Referer"] == "https://www.xiaohongshu.com/"
    assert detail.feed_id == feed_id
    assert detail.xsec_token == token
    assert detail.title == "合成 HTTP 详情"
    assert token not in repr(detail)


async def test_page_token_takes_precedence_over_requested_token(
    tmp_path: Path,
) -> None:
    """确保页面返回的新令牌覆盖请求令牌，但模型 repr 继续脱敏。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            text=_html("synthetic-feed", xsec_token="refreshed-token"),
        )

    async with _provider(tmp_path, handler) as provider:
        detail = await provider.get_feed_detail(
            "synthetic-feed",
            "requested-token",
        )

    assert detail.xsec_token == "refreshed-token"
    assert "refreshed-token" not in repr(detail)


async def test_missing_cookie_fails_without_sending_request(tmp_path: Path) -> None:
    """确保未配置 Cookie 时不会发起任何网络请求。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    called = False

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal called
        called = True
        return httpx.Response(200)

    async with _provider(tmp_path, handler, cookie="  ") as provider:
        with pytest.raises(ProviderError) as captured:
            await provider.get_feed_detail("synthetic-feed", "secret-token")

    assert called is False
    assert captured.value.provider is ProviderKind.HTTP
    assert captured.value.code is ProviderFailureCode.NOT_CONFIGURED
    assert "secret-token" not in str(captured.value)


async def test_unsafe_cookie_is_rejected_before_header_construction(
    tmp_path: Path,
) -> None:
    """确保含控制字符的 Cookie 不会进入 HTTP 请求头。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    called = False

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal called
        called = True
        return httpx.Response(200)

    async with _provider(
        tmp_path,
        handler,
        cookie="session=synthetic\ninjected=value",
    ) as provider:
        with pytest.raises(ProviderError) as captured:
            await provider.get_feed_detail("synthetic-feed", "secret-token")

    assert called is False
    assert captured.value.code is ProviderFailureCode.NOT_CONFIGURED
    assert "injected" not in str(captured.value)


async def test_invalid_payload_is_redacted_and_never_requested(
    tmp_path: Path,
) -> None:
    """确保参数验证错误不回显令牌，也不触发请求。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    called = False

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal called
        called = True
        return httpx.Response(200)

    async with _provider(tmp_path, handler) as provider:
        with pytest.raises(ProviderError) as captured:
            await provider.get_feed_detail("", "secret-token")

    assert called is False
    assert captured.value.code is ProviderFailureCode.INVALID_RESULT
    assert captured.value.__cause__ is None
    assert "secret-token" not in str(captured.value)
    assert "secret-token" not in repr(captured.value)


@pytest.mark.parametrize(
    ("body", "code"),
    [
        ("<html>没有状态</html>", ProviderFailureCode.PAGE_INCOMPATIBLE),
        (
            _html("other-feed"),
            ProviderFailureCode.INVALID_RESULT,
        ),
    ],
)
async def test_page_failures_are_mapped_by_parser(
    tmp_path: Path,
    body: str,
    code: ProviderFailureCode,
) -> None:
    """确保可访问页面的状态缺失与 ID 不符采用不同失败分类。

    Args:
        tmp_path: Pytest 提供的临时目录。
        body: 合成 HTTP 页面。
        code: 预期失败分类。
    """

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text=body)

    async with _provider(tmp_path, handler) as provider:
        with pytest.raises(ProviderError) as captured:
            await provider.get_feed_detail("synthetic-feed", "secret-token")

    assert captured.value.code is code
    assert "secret-token" not in str(captured.value)


async def test_explicit_guest_state_maps_to_expired_cookie(tmp_path: Path) -> None:
    """确保配置了 Cookie 却收到访客状态时明确提示登录过期。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    state = {"user": {"userInfo": {"value": {"guest": True}}}}
    script = json.dumps(state)

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            text=f"<script>window.__INITIAL_STATE__={script}</script>",
        )

    async with _provider(tmp_path, handler) as provider:
        with pytest.raises(ProviderError) as captured:
            await provider.get_feed_detail("synthetic-feed", "secret-token")

    assert captured.value.code is ProviderFailureCode.AUTHENTICATION_EXPIRED
    assert "secret-token" not in str(captured.value)


async def test_transient_status_retries_without_logging_sensitive_values(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """确保瞬时状态码可恢复，且重试日志不包含凭据和详情 URL。

    Args:
        tmp_path: Pytest 提供的临时目录。
        monkeypatch: Pytest 提供的替换工具。
        caplog: Pytest 提供的日志捕获工具。
    """
    attempts = 0

    async def no_sleep(delay: float) -> None:
        return None

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal attempts
        attempts += 1
        if attempts == 1:
            return httpx.Response(503)
        return httpx.Response(200, text=_html("synthetic-feed"))

    monkeypatch.setattr("xhs_adapters._http_feed_page.sleep", no_sleep)
    async with _provider(tmp_path, handler, max_retry=1) as provider:
        detail = await provider.get_feed_detail("synthetic-feed", "secret-token")

    assert detail.feed_id == "synthetic-feed"
    assert attempts == 2
    assert "secret-token" not in caplog.text
    assert "session=synthetic-cookie" not in caplog.text
