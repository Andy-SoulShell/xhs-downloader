"""基于 HTTPX 的网络访问实现。"""

from asyncio import sleep
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from httpx import AsyncClient, AsyncHTTPTransport, HTTPError, Response
from loguru import logger

from src.config import AppSettings
from src.domain.errors import DownloadError, InvalidPartialContentError


class HttpxGateway:
    """共享连接池并统一处理重试、代理和请求头。

    Args:
        settings: 网络超时、代理、Cookie 和重试配置。
        transport: 测试时可注入的 HTTPX 传输实现。
    """

    def __init__(
        self,
        settings: AppSettings,
        transport: AsyncHTTPTransport | None = None,
    ) -> None:
        self._settings = settings
        self._client = AsyncClient(
            headers={
                "User-Agent": settings.user_agent,
                "Referer": "https://www.xiaohongshu.com/",
            },
            proxy=settings.proxy,
            timeout=settings.timeout,
            follow_redirects=True,
            http2=transport is None,
            transport=transport,
        )

    async def __aenter__(self) -> "HttpxGateway":
        return self

    async def __aexit__(self, exc_type, exc_value, traceback) -> None:
        await self.close()

    async def close(self) -> None:
        """关闭连接池并释放网络资源。"""
        await self._client.aclose()

    async def resolve(self, url: str) -> str:
        """解析短链接并返回最终地址。

        Args:
            url: 短链接。

        Returns:
            重定向后的最终 URL。

        Raises:
            DownloadError: 所有重试均失败。
        """
        response = await self._request_with_retry("GET", url)
        return str(response.url)

    async def get_text(self, url: str, cookie: str | None = None) -> str:
        """获取作品页面文本。

        Args:
            url: 作品页面地址。
            cookie: 覆盖默认配置的单次请求 Cookie。

        Returns:
            页面 UTF-8 文本。

        Raises:
            DownloadError: 所有重试均失败。
        """
        configured_cookie = self._settings.cookie.get_secret_value()
        value = cookie or configured_cookie
        headers = {"Cookie": value} if value else None
        response = await self._request_with_retry("GET", url, headers=headers)
        return response.text

    @asynccontextmanager
    async def stream(
        self,
        url: str,
        headers: dict[str, str] | None = None,
    ) -> AsyncIterator[Response]:
        """打开媒体响应流。

        Args:
            url: 媒体地址。
            headers: Range 等单次请求头。

        Yields:
            已检查状态码的 HTTPX 响应。

        Raises:
            DownloadError: 媒体请求失败。
        """
        try:
            async with self._client.stream("GET", url, headers=headers) as response:
                if response.status_code == 416:
                    raise InvalidPartialContentError("远端拒绝当前断点位置")
                response.raise_for_status()
                yield response
        except InvalidPartialContentError:
            raise
        except HTTPError as error:
            raise DownloadError(f"媒体请求失败：{error}") from error

    async def _request_with_retry(
        self,
        method: str,
        url: str,
        **kwargs,
    ) -> Response:
        last_error: HTTPError | None = None
        for attempt in range(self._settings.max_retry + 1):
            try:
                response = await self._client.request(method, url, **kwargs)
                response.raise_for_status()
                return response
            except HTTPError as error:
                last_error = error
                if attempt < self._settings.max_retry:
                    logger.warning(
                        "网络请求失败，将进行第 {} 次重试：{}",
                        attempt + 1,
                        error.__class__.__name__,
                    )
                    await sleep(min(2**attempt, 4))
        raise DownloadError(f"页面请求失败：{last_error}") from last_error
