"""统一只读能力的进程内运行时。"""

from collections.abc import Awaitable, Callable

from xhs_adapters import (
    BrowserRuntime,
    HttpFeedDetailProvider,
    PublicationRuntime,
)
from xhs_adapters.config import AppSettings
from xhs_core.application import (
    BrowserReadinessService,
    BrowserReadProvider,
    CapabilityRouter,
)
from xhs_core.domain import (
    FeedDetailResult,
    FeedListResult,
    ProviderError,
    ProviderFailureCode,
    ProviderKind,
    RoutedCapabilityResult,
    UserProfileResult,
)
from xhs_core.domain.browser_requests import SearchFilters

type _UnsupportedCall[ResultT] = Callable[[], Awaitable[ResultT]]


class ReadCapabilityRuntime:
    """固定一份路由配置及其 HTTP、浏览器只读 Provider。

    每个请求租用一个运行时快照，因此请求执行期间不会混用更新前后的
    Cookie、代理、路由策略或浏览器驱动。

    Args:
        settings: 本运行时采用的已验证配置。
        http: Cookie HTTP 详情 Provider。
        browser: 固定浏览器驱动的只读 Provider。
    """

    def __init__(
        self,
        settings: AppSettings,
        http: HttpFeedDetailProvider,
        browser: BrowserReadProvider,
    ) -> None:
        self.strategy = settings.route_strategy
        self.browser_driver = settings.browser_driver
        self._http = http
        self._browser = browser
        self._router = CapabilityRouter()

    async def close(self) -> None:
        """关闭本运行时持有的 HTTP 连接池。"""
        await self._http.close()

    async def list_feeds(
        self,
        request_id: str | None = None,
    ) -> RoutedCapabilityResult[FeedListResult]:
        """按当前策略读取首页推荐。

        Args:
            request_id: 可选的浏览器任务幂等标识。

        Returns:
            推荐列表及实际路由轨迹。

        Raises:
            ProviderError: 所选提供方无法完成读取。
        """
        return await self._router.execute_read(
            self.strategy,
            http=_unsupported("HTTP 模式暂不支持读取推荐"),
            browser=lambda: self._browser.list_feeds(request_id),
        )

    async def search_feeds(
        self,
        keyword: str,
        filters: SearchFilters,
        request_id: str | None = None,
    ) -> RoutedCapabilityResult[FeedListResult]:
        """按当前策略搜索帖子。

        Args:
            keyword: 搜索关键词。
            filters: 页面筛选条件。
            request_id: 可选的浏览器任务幂等标识。

        Returns:
            搜索结果及实际路由轨迹。

        Raises:
            ProviderError: 所选提供方无法完成读取。
        """
        return await self._router.execute_read(
            self.strategy,
            http=_unsupported("HTTP 模式暂不支持搜索帖子"),
            browser=lambda: self._browser.search_feeds(
                keyword,
                filters,
                request_id,
            ),
        )

    async def get_feed_detail(
        self,
        feed_id: str,
        xsec_token: str,
        *,
        comment_limit: int,
        include_replies: bool,
        reply_limit: int,
        request_id: str | None = None,
    ) -> RoutedCapabilityResult[FeedDetailResult]:
        """按当前策略读取帖子详情。

        Args:
            feed_id: 目标帖子标识。
            xsec_token: 页面访问令牌。
            comment_limit: 最多读取的一级评论数。
            include_replies: 是否读取当前已加载回复。
            reply_limit: 每条评论最多读取的回复数。
            request_id: 可选的浏览器任务幂等标识。

        Returns:
            帖子详情及实际路由轨迹。

        Raises:
            ProviderError: 所选提供方无法完成读取。
        """
        options = {
            "comment_limit": comment_limit,
            "include_replies": include_replies,
            "reply_limit": reply_limit,
        }
        return await self._router.execute_read(
            self.strategy,
            http=lambda: self._http.get_feed_detail(
                feed_id,
                xsec_token,
                **options,
            ),
            browser=lambda: self._browser.get_feed_detail(
                feed_id,
                xsec_token,
                request_id=request_id,
                **options,
            ),
        )

    async def get_user_profile(
        self,
        user_id: str,
        xsec_token: str,
        request_id: str | None = None,
    ) -> RoutedCapabilityResult[UserProfileResult]:
        """按当前策略读取指定用户主页。

        Args:
            user_id: 目标用户标识。
            xsec_token: 页面访问令牌。
            request_id: 可选的浏览器任务幂等标识。

        Returns:
            用户主页及实际路由轨迹。

        Raises:
            ProviderError: 所选提供方无法完成读取。
        """
        return await self._router.execute_read(
            self.strategy,
            http=_unsupported("HTTP 模式暂不支持读取用户主页"),
            browser=lambda: self._browser.get_user_profile(
                user_id,
                xsec_token,
                request_id,
            ),
        )

    async def get_my_profile(
        self,
        request_id: str | None = None,
    ) -> RoutedCapabilityResult[UserProfileResult]:
        """按当前策略读取已登录账号主页。

        Args:
            request_id: 可选的浏览器任务幂等标识。

        Returns:
            当前账号主页及实际路由轨迹。

        Raises:
            ProviderError: 所选提供方无法完成读取。
        """
        return await self._router.execute_read(
            self.strategy,
            http=_unsupported("HTTP 模式暂不支持读取当前账号主页"),
            browser=lambda: self._browser.get_my_profile(request_id),
        )


def create_read_capability_runtime(
    settings: AppSettings,
    browser: BrowserRuntime,
    publication: PublicationRuntime,
) -> ReadCapabilityRuntime:
    """创建一份可由请求原子租用的只读能力运行时。

    Args:
        settings: 本运行时采用的已验证配置。
        browser: 浏览器任务及受管浏览器生命周期。
        publication: 提供扩展在线状态的共享运行时。

    Returns:
        固定配置且尚未关闭的运行时。
    """
    readiness = BrowserReadinessService(
        publication.credentials,
        browser.managed,
    )
    return ReadCapabilityRuntime(
        settings,
        HttpFeedDetailProvider(settings),
        BrowserReadProvider(
            browser.tasks,
            readiness,
            settings.browser_driver,
            timeout_seconds=settings.timeout,
        ),
    )


def _unsupported[ResultT](message: str) -> _UnsupportedCall[ResultT]:
    async def operation() -> ResultT:
        raise ProviderError(
            ProviderKind.HTTP,
            ProviderFailureCode.UNSUPPORTED,
            message,
        )

    return operation
