"""HTTPX 网络网关测试。"""

from pathlib import Path

import httpx
import pytest
from xhs_adapters.config import AppSettings
from xhs_adapters.http import HttpxGateway
from xhs_core.domain.errors import DownloadError, InvalidPartialContentError


def _gateway(
    tmp_path: Path,
    handler,
    *,
    cookie: str = "",
    max_retry: int = 0,
) -> HttpxGateway:
    settings = AppSettings(
        work_path=tmp_path,
        cookie=cookie,
        max_retry=max_retry,
    )
    return HttpxGateway(settings, transport=httpx.MockTransport(handler))


async def test_resolve_follows_redirects(tmp_path: Path) -> None:
    """确保短链接解析返回最终重定向地址。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/short":
            return httpx.Response(302, headers={"Location": "/final"})
        return httpx.Response(200)

    async with _gateway(tmp_path, handler) as gateway:
        result = await gateway.resolve("https://example.invalid/short")

    assert result == "https://example.invalid/final"


async def test_get_text_uses_default_and_override_cookie(tmp_path: Path) -> None:
    """确保页面请求使用默认 Cookie，并允许单次覆盖。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    cookies: list[str | None] = []

    def handler(request: httpx.Request) -> httpx.Response:
        cookies.append(request.headers.get("Cookie"))
        return httpx.Response(200, text="合成页面")

    async with _gateway(tmp_path, handler, cookie="default=1") as gateway:
        assert await gateway.get_text("https://example.invalid") == "合成页面"
        await gateway.get_text("https://example.invalid", "override=1")

    assert cookies == ["default=1", "override=1"]


async def test_stream_yields_successful_response(tmp_path: Path) -> None:
    """确保媒体流透传请求头和响应内容。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    received_range: str | None = None

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal received_range
        received_range = request.headers.get("Range")
        return httpx.Response(206, content=b"tail")

    async with (
        _gateway(tmp_path, handler) as gateway,
        gateway.stream(
            "https://example.invalid/media",
            {"Range": "bytes=4-"},
        ) as response,
    ):
        content = await response.aread()

    assert received_range == "bytes=4-"
    assert content == b"tail"


@pytest.mark.parametrize(
    ("status", "error_type"),
    [(416, InvalidPartialContentError), (404, DownloadError)],
)
async def test_stream_translates_http_failures(
    tmp_path: Path,
    status: int,
    error_type: type[Exception],
) -> None:
    """确保媒体状态码转换为稳定的领域异常。

    Args:
        tmp_path: Pytest 提供的临时目录。
        status: 合成的 HTTP 状态码。
        error_type: 预期的领域异常类型。
    """

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(status)

    async with _gateway(tmp_path, handler) as gateway:
        with pytest.raises(error_type):
            async with gateway.stream("https://example.invalid/media"):
                pass


async def test_request_retries_transient_failure(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """确保页面请求可在瞬时故障后恢复。

    Args:
        tmp_path: Pytest 提供的临时目录。
        monkeypatch: Pytest 提供的替换工具。
    """
    attempts = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal attempts
        attempts += 1
        return httpx.Response(503 if attempts == 1 else 200, text="ok")

    async def no_sleep(delay: float) -> None:
        return None

    monkeypatch.setattr("xhs_adapters.http.sleep", no_sleep)
    async with _gateway(tmp_path, handler, max_retry=1) as gateway:
        result = await gateway.get_text("https://example.invalid")

    assert result == "ok"
    assert attempts == 2


async def test_request_raises_after_retry_exhaustion(tmp_path: Path) -> None:
    """确保页面请求耗尽重试后抛出下载异常。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500)

    gateway = _gateway(tmp_path, handler)
    with pytest.raises(DownloadError, match="页面请求失败"):
        await gateway.get_text("https://example.invalid")
    await gateway.close()
