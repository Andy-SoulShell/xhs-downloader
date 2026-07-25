"""HTTP 详情页的同源请求与安全响应读取。"""

import re
from asyncio import sleep
from urllib.parse import urljoin, urlsplit

from httpx import (
    AsyncBaseTransport,
    AsyncClient,
    RequestError,
    Response,
    TimeoutException,
)
from xhs_core.domain import ProviderError, ProviderFailureCode, ProviderKind

_ORIGIN = "https://www.xiaohongshu.com"
_HOST = "www.xiaohongshu.com"
_MAX_REDIRECTS = 5
_MAX_PAGE_BYTES = 10 * 1024 * 1024
_REDIRECT_STATUSES = frozenset({301, 302, 303, 307, 308})
_LOGIN_CLASS = re.compile(
    r"""class\s*=\s*(?:["'][^"']*login-container|[^\s"'=<>`]*login-container)""",
    re.I,
)


class _RetryableProviderError(ProviderError):
    pass


class _SameOriginPageClient:
    """仅向小红书主站发送 Cookie 的私有 HTTP 客户端。"""

    def __init__(
        self,
        *,
        cookie: str,
        user_agent: str,
        proxy: str | None,
        timeout: float,
        max_retry: int,
        transport: AsyncBaseTransport | None,
    ) -> None:
        self._cookie = cookie
        self._max_retry = max_retry
        try:
            self._client = AsyncClient(
                headers={
                    "User-Agent": user_agent,
                    "Referer": f"{_ORIGIN}/",
                },
                proxy=proxy,
                timeout=timeout,
                follow_redirects=False,
                http2=transport is None,
                transport=transport,
                trust_env=False,
            )
        except (TypeError, ValueError):
            raise _error(
                ProviderFailureCode.NOT_CONFIGURED,
                "HTTP 客户端配置无效",
            ) from None

    async def close(self) -> None:
        await self._client.aclose()

    async def load(self, url: str) -> str:
        for attempt in range(self._max_retry + 1):
            try:
                return await self._load_once(url)
            except ProviderError as error:
                if (
                    not isinstance(error, _RetryableProviderError)
                    or attempt >= self._max_retry
                ):
                    raise
                await sleep(min(2**attempt, 4))
        raise AssertionError("HTTP 重试循环未返回结果")

    async def _load_once(self, url: str) -> str:
        current = url
        visited: set[str] = set()
        try:
            for _ in range(_MAX_REDIRECTS + 1):
                _ensure_allowed_url(current)
                if current in visited:
                    raise _error(
                        ProviderFailureCode.PAGE_INCOMPATIBLE,
                        "HTTP 详情页发生循环重定向",
                    )
                visited.add(current)
                request = self._client.build_request(
                    "GET",
                    current,
                    headers={"Cookie": self._cookie},
                )
                response = await self._client.send(request, stream=True)
                try:
                    if response.status_code in _REDIRECT_STATUSES:
                        current = _redirect_target(current, response)
                        if _is_login_url(current):
                            raise _authentication_expired()
                        continue
                    _raise_for_status(response.status_code)
                    if _is_login_url(current):
                        raise _authentication_expired()
                    page = await _read_page(response)
                    if _LOGIN_CLASS.search(page):
                        raise _authentication_expired()
                    return page
                finally:
                    await response.aclose()
            raise _error(
                ProviderFailureCode.PAGE_INCOMPATIBLE,
                "HTTP 详情页重定向次数过多",
            )
        except ProviderError:
            raise
        except TimeoutException:
            raise _retryable_error(
                ProviderFailureCode.TIMEOUT_BEFORE_EFFECT,
                "HTTP 详情请求超时",
            ) from None
        except RequestError:
            raise _retryable_error(
                ProviderFailureCode.UNAVAILABLE,
                "HTTP 详情服务暂不可用",
            ) from None
        except (TypeError, ValueError):
            raise _error(
                ProviderFailureCode.NOT_CONFIGURED,
                "HTTP Cookie 配置无效",
            ) from None


def _ensure_allowed_url(value: str) -> None:
    try:
        parsed = urlsplit(value)
        port = parsed.port
    except ValueError:
        raise _unsafe_redirect() from None
    allowed = (
        parsed.scheme == "https"
        and parsed.hostname == _HOST
        and port in {None, 443}
        and parsed.username is None
        and parsed.password is None
    )
    if not allowed:
        raise _unsafe_redirect()


def _redirect_target(current: str, response: Response) -> str:
    location = response.headers.get("Location")
    if not location:
        raise _error(
            ProviderFailureCode.PAGE_INCOMPATIBLE,
            "HTTP 详情页重定向缺少目标地址",
        )
    target = urljoin(current, location)
    _ensure_allowed_url(target)
    return target


async def _read_page(response: Response) -> str:
    content_length = response.headers.get("Content-Length", "")
    declared_too_large = content_length.isdigit() and (
        len(content_length) > len(str(_MAX_PAGE_BYTES))
        or int(content_length) > _MAX_PAGE_BYTES
    )
    if declared_too_large:
        raise _page_too_large()
    chunks: list[bytes] = []
    total = 0
    async for chunk in response.aiter_bytes():
        total += len(chunk)
        if total > _MAX_PAGE_BYTES:
            raise _page_too_large()
        chunks.append(chunk)
    encoding = response.encoding or "utf-8"
    try:
        return b"".join(chunks).decode(encoding, errors="replace")
    except LookupError:
        return b"".join(chunks).decode("utf-8", errors="replace")


def _raise_for_status(status: int) -> None:
    if status in {401, 403}:
        raise _authentication_expired()
    if status == 408:
        raise _retryable_error(
            ProviderFailureCode.TIMEOUT_BEFORE_EFFECT,
            "HTTP 详情请求超时",
        )
    if status == 429 or status >= 500:
        raise _retryable_error(
            ProviderFailureCode.UNAVAILABLE,
            "HTTP 详情服务暂不可用",
        )
    if not 200 <= status < 300:
        raise _error(
            ProviderFailureCode.UNAVAILABLE,
            "HTTP 详情服务暂不可用",
        )


def _is_login_url(value: str) -> bool:
    path = urlsplit(value).path.lower()
    return "login" in path or "signin" in path


def _authentication_expired() -> ProviderError:
    return _error(
        ProviderFailureCode.AUTHENTICATION_EXPIRED,
        "HTTP Cookie 已过期，请重新登录",
    )


def _unsafe_redirect() -> ProviderError:
    return _error(
        ProviderFailureCode.PAGE_INCOMPATIBLE,
        "HTTP 详情页尝试跳转到不受信任的地址",
    )


def _page_too_large() -> ProviderError:
    return _error(
        ProviderFailureCode.PAGE_INCOMPATIBLE,
        "HTTP 详情页响应超过安全大小限制",
    )


def _error(code: ProviderFailureCode, message: str) -> ProviderError:
    return ProviderError(ProviderKind.HTTP, code, message)


def _retryable_error(
    code: ProviderFailureCode,
    message: str,
) -> ProviderError:
    return _RetryableProviderError(ProviderKind.HTTP, code, message)
