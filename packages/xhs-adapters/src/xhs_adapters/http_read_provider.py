"""Cookie 与 HTTP 方式的统一只读 Provider。"""

from httpx import AsyncBaseTransport
from xhs_core.domain import (
    AccountProof,
    FeedDetailResult,
    FeedListResult,
    OneTimeAccountChallenge,
    ProviderError,
    ProviderFailureCode,
    ProviderKind,
    UserProfileResult,
)
from xhs_core.domain.browser_requests import SearchFilters

from xhs_adapters._http_feed_page import _SameOriginPageClient
from xhs_adapters._http_read_requests import (
    EXPLORE_URL,
    build_detail_url,
    build_profile_url,
    build_search_url,
    validate_detail_payload,
    validate_profile_payload,
    validate_search_payload,
)
from xhs_adapters.config import AppSettings
from xhs_adapters.parsing._initial_state import initial_state_is_guest
from xhs_adapters.parsing.current_account import parse_current_account_id
from xhs_adapters.parsing.feed_detail import FeedDetailStateParser
from xhs_adapters.parsing.feed_list import FeedListStateParser
from xhs_adapters.parsing.user_profile import UserProfileStateParser

_DEFAULT_SEARCH_FILTERS = SearchFilters()


class HttpReadProvider:
    """使用本地 Cookie 从网页初始状态执行统一只读能力。

    Provider 不保存请求或响应内容，不记录 Cookie、访问令牌和目标 URL；
    每一跳请求均由同源客户端限制在小红书 HTTPS 主站。

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
        self._feed_list_parser = FeedListStateParser()
        self._feed_detail_parser = FeedDetailStateParser()
        self._profile_parser = UserProfileStateParser()

    async def __aenter__(self) -> "HttpReadProvider":
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

    async def prove_account(
        self,
        challenge: OneTimeAccountChallenge,
    ) -> AccountProof:
        """在 HTTP 会话内部生成一次性账号证明。

        稳定账号标识只存在于本方法局部变量，不会作为返回值、日志或
        诊断数据离开 Provider。

        Args:
            challenge: 本轮跨提供方比较的一次性挑战。

        Returns:
            HMAC 证明、明确未登录或无法可靠识别状态。

        Raises:
            ProviderError: Cookie 未配置或页面请求失败。
        """
        self._ensure_configured()
        page = await self._client.load(EXPLORE_URL)
        if initial_state_is_guest(page):
            return AccountProof.logged_out()
        account_id = parse_current_account_id(page)
        if account_id is None:
            return AccountProof.unverified()
        return AccountProof.proved(challenge.prove(account_id))

    async def list_feeds(self) -> FeedListResult:
        """读取推荐页当前初始 Feed。

        Returns:
            推荐页首批 Feed 列表。

        Raises:
            ProviderError: Cookie 无效、页面不可访问或状态结构不兼容。
        """
        page = await self._load(EXPLORE_URL)
        return self._feed_list_parser.parse(page, "home")

    async def search_feeds(
        self,
        keyword: str,
        filters: SearchFilters,
    ) -> FeedListResult:
        """使用页面默认筛选搜索帖子。

        Args:
            keyword: 搜索关键词。
            filters: 必须全部采用默认值的搜索筛选。

        Returns:
            与请求关键词绑定的搜索首批结果。

        Raises:
            ProviderError: 筛选需浏览器交互、参数无效或页面读取失败。
        """
        self._ensure_configured()
        payload = validate_search_payload(keyword, filters)
        if payload.filters != _DEFAULT_SEARCH_FILTERS:
            await self._load(EXPLORE_URL)
            raise _error(
                ProviderFailureCode.UNSUPPORTED,
                "HTTP 搜索仅支持默认筛选，请改用浏览器模式",
            )
        page = await self._load(build_search_url(payload.keyword))
        return self._feed_list_parser.parse(
            page,
            "search",
            keyword=payload.keyword,
        )

    async def get_feed_detail(
        self,
        feed_id: str,
        xsec_token: str,
        *,
        comment_limit: int = 10,
        include_replies: bool = False,
        reply_limit: int = 10,
    ) -> FeedDetailResult:
        """读取帖子详情、互动状态和页面当前携带的评论。

        Args:
            feed_id: 目标帖子 ID。
            xsec_token: Feed 返回的访问令牌。
            comment_limit: 最多返回的一级评论数。
            include_replies: 是否返回页面当前已加载的回复。
            reply_limit: 每条一级评论最多返回的回复数。

        Returns:
            从原始页面状态验证得到的帖子详情。

        Raises:
            ProviderError: 请求参数无效或页面结果不属于目标帖子。
        """
        self._ensure_configured()
        payload = validate_detail_payload(
            feed_id,
            xsec_token,
            comment_limit,
            include_replies,
            reply_limit,
        )
        page = await self._load(build_detail_url(payload))
        return self._feed_detail_parser.parse(
            page,
            payload.feed_id,
            payload.xsec_token,
            comment_limit=payload.comment_limit,
            include_replies=payload.include_replies,
            reply_limit=payload.reply_limit,
        )

    async def get_user_profile(
        self,
        user_id: str,
        xsec_token: str,
    ) -> UserProfileResult:
        """读取并严格核对指定用户主页。

        Args:
            user_id: 目标用户 ID。
            xsec_token: Feed 返回的主页访问令牌。

        Returns:
            身份与目标用户一致的主页资料。

        Raises:
            ProviderError: 请求无效、登录过期或页面身份不一致。
        """
        self._ensure_configured()
        payload = validate_profile_payload(user_id, xsec_token)
        page = await self._load(build_profile_url(payload.user_id, payload.xsec_token))
        return self._profile_parser.parse(page, payload.user_id)

    async def get_my_profile(self) -> UserProfileResult:
        """从推荐页严格识别当前账号后读取其主页。

        Returns:
            当前 Cookie 对应账号的主页资料。

        Raises:
            ProviderError: 登录过期，或推荐页无法可靠识别当前账号。
        """
        page = await self._load(EXPLORE_URL)
        user_id = parse_current_account_id(page)
        if user_id is None:
            raise _error(
                ProviderFailureCode.UNSUPPORTED,
                "HTTP 推荐页无法可靠识别当前账号，请改用浏览器模式",
            )
        profile_page = await self._load(build_profile_url(user_id, None))
        return self._profile_parser.parse(profile_page, user_id)

    async def _load(self, url: str) -> str:
        self._ensure_configured()
        page = await self._client.load(url)
        if initial_state_is_guest(page):
            raise _error(
                ProviderFailureCode.AUTHENTICATION_EXPIRED,
                "HTTP Cookie 已过期，请重新登录",
            )
        return page

    def _ensure_configured(self) -> None:
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


def _error(code: ProviderFailureCode, message: str) -> ProviderError:
    return ProviderError(ProviderKind.HTTP, code, message)
