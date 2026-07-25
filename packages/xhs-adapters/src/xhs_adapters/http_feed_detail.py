"""Cookie 与 HTTP 方式的帖子详情 Provider。"""

from urllib.parse import quote, urlencode

from httpx import AsyncBaseTransport
from pydantic import ValidationError
from xhs_core.domain import (
    FeedDetailResult,
    ProviderError,
    ProviderFailureCode,
    ProviderKind,
)
from xhs_core.domain.browser_requests import FeedDetailPayload

from xhs_adapters._http_feed_page import _SameOriginPageClient
from xhs_adapters.config import AppSettings
from xhs_adapters.parsing._initial_state import initial_state_is_guest
from xhs_adapters.parsing.feed_detail import FeedDetailStateParser

_ORIGIN = "https://www.xiaohongshu.com"


class HttpFeedDetailProvider:
    """使用本地 Cookie 从网页初始状态读取完整帖子详情。

    Provider 不保存请求或响应内容，不记录 Cookie、访问令牌和详情 URL；每一跳
    请求均限制为小红书 HTTPS 主站。

    Args:
        settings: HTTP 超时、代理、重试、User-Agent 与 Cookie 配置。
        transport: 测试时注入的 HTTPX 异步传输。

    Raises:
        ProviderError: HTTP 客户端配置无效。
    """

    def __init__(
        self,
        settings: AppSettings,
        transport: AsyncBaseTransport | None = None,
    ) -> None:
        cookie = settings.cookie.get_secret_value()
        self._cookie_configured = bool(cookie.strip())
        self._cookie_valid = all(
            ord(character) >= 32 and ord(character) != 127 for character in cookie
        )
        self._client = _SameOriginPageClient(
            cookie=cookie,
            user_agent=settings.user_agent,
            proxy=settings.proxy,
            timeout=settings.timeout,
            max_retry=settings.max_retry,
            transport=transport,
        )
        self._parser = FeedDetailStateParser()

    async def __aenter__(self) -> "HttpFeedDetailProvider":
        """进入 Provider 异步资源上下文。

        Returns:
            当前 Provider。
        """
        return self

    async def __aexit__(self, exc_type, exc_value, traceback) -> None:
        """退出异步资源上下文并关闭连接池。

        Args:
            exc_type: 上下文中的异常类型。
            exc_value: 上下文中的异常实例。
            traceback: 上下文中的异常调用栈。
        """
        await self.close()

    async def close(self) -> None:
        """关闭 HTTP 连接池。"""
        await self._client.close()

    async def get_feed_detail(
        self,
        feed_id: str,
        xsec_token: str,
        *,
        comment_limit: int = 10,
        include_replies: bool = False,
        reply_limit: int = 10,
    ) -> FeedDetailResult:
        """读取帖子详情、互动状态和当前页面携带的评论。

        Args:
            feed_id: 目标帖子 ID。
            xsec_token: Feed 返回的访问令牌。
            comment_limit: 最多返回的一级评论数。
            include_replies: 是否返回页面当前已加载的回复。
            reply_limit: 每条一级评论最多返回的回复数。

        Returns:
            从原始页面状态直接验证得到的帖子详情。

        Raises:
            ProviderError: Provider 未配置、网络失败、登录过期、页面不兼容
                或结果不属于目标帖子。
        """
        if not self._cookie_configured:
            raise _error(
                ProviderFailureCode.NOT_CONFIGURED,
                "HTTP 模式尚未配置 Cookie",
            )
        if not self._cookie_valid:
            raise _error(
                ProviderFailureCode.NOT_CONFIGURED,
                "HTTP Cookie 配置无效",
            )
        payload = _validate_payload(
            feed_id,
            xsec_token,
            comment_limit,
            include_replies,
            reply_limit,
        )
        page = await self._client.load(_build_url(payload))
        try:
            return self._parser.parse(
                page,
                payload.feed_id,
                payload.xsec_token,
                comment_limit=payload.comment_limit,
                include_replies=payload.include_replies,
                reply_limit=payload.reply_limit,
            )
        except ProviderError as error:
            if (
                error.code is ProviderFailureCode.PAGE_INCOMPATIBLE
                and initial_state_is_guest(page)
            ):
                raise _error(
                    ProviderFailureCode.AUTHENTICATION_EXPIRED,
                    "HTTP Cookie 已过期，请重新登录",
                ) from None
            raise


def _validate_payload(
    feed_id: str,
    xsec_token: str,
    comment_limit: int,
    include_replies: bool,
    reply_limit: int,
) -> FeedDetailPayload:
    try:
        return FeedDetailPayload(
            feed_id=feed_id,
            xsec_token=xsec_token,
            comment_limit=comment_limit,
            include_replies=include_replies,
            reply_limit=reply_limit,
        )
    except ValidationError:
        raise _error(
            ProviderFailureCode.INVALID_RESULT,
            "HTTP 详情请求参数无效",
        ) from None


def _build_url(payload: FeedDetailPayload) -> str:
    feed_segment = quote(payload.feed_id, safe="").replace(".", "%2E")
    query = urlencode(
        {
            "xsec_token": payload.xsec_token,
            "xsec_source": "pc_feed",
        }
    )
    return f"{_ORIGIN}/explore/{feed_segment}?{query}"


def _error(code: ProviderFailureCode, message: str) -> ProviderError:
    return ProviderError(ProviderKind.HTTP, code, message)
