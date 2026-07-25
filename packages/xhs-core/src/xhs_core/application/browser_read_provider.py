"""把持久化浏览器任务适配为统一路由可调用的只读 Provider。"""

from pydantic import JsonValue

from xhs_core.domain import (
    BrowserDriver,
    BrowserTaskKind,
    FeedDetailResult,
    FeedListResult,
    UserProfileResult,
)
from xhs_core.domain.browser_requests import SearchFilters

from .browser_read_execution import _BrowserReadExecution
from .browser_readiness import BrowserReadinessProbe
from .browser_tasks import BrowserTaskService


class BrowserReadProvider:
    """通过指定浏览器驱动执行并严格解析首批只读能力。

    每次调用先检查驱动可用性，再提交原生 ``BrowserTask``。等待超时
    时会原子取消尚未进入 ``running`` 的任务，避免稍后被浏览器领取并
    成为无人观察的队列任务。

    Args:
        tasks: 浏览器任务提交、等待和取消用例。
        readiness: 扩展与受管浏览器的可用性检查。
        driver: 本 Provider 固定使用的浏览器执行驱动。
        timeout_seconds: 单项任务最长等待秒数。
        poll_interval: 等待期间的仓储轮询间隔秒数。

    Raises:
        ValueError: 等待参数不在有效范围内。
    """

    def __init__(
        self,
        tasks: BrowserTaskService,
        readiness: BrowserReadinessProbe,
        driver: BrowserDriver,
        timeout_seconds: float = 30,
        poll_interval: float = 0.2,
    ) -> None:
        if timeout_seconds <= 0 or poll_interval <= 0:
            raise ValueError("浏览器只读 Provider 等待参数必须大于零")
        self._execution = _BrowserReadExecution(
            tasks,
            readiness,
            driver,
            timeout_seconds,
            poll_interval,
        )

    async def list_feeds(self, request_id: str | None = None) -> FeedListResult:
        """读取首页推荐 Feed。

        Args:
            request_id: 可选的调用方幂等请求标识。

        Returns:
            严格标记为首页来源的 Feed 列表。

        Raises:
            ProviderError: 浏览器不可用、超时、执行失败或结果不可信。
        """
        return await self._execution.execute(
            BrowserTaskKind.LIST_FEEDS,
            {},
            request_id,
            FeedListResult,
            lambda value: value.source == "home" and value.keyword is None,
            "推荐结果来源与请求不一致",
        )

    async def search_feeds(
        self,
        keyword: str,
        filters: SearchFilters | None = None,
        request_id: str | None = None,
    ) -> FeedListResult:
        """搜索 Feed 并核对结果关键词。

        Args:
            keyword: 搜索关键词。
            filters: 可选浏览器页面筛选条件。
            request_id: 可选的调用方幂等请求标识。

        Returns:
            严格标记为搜索来源且关键词一致的 Feed 列表。

        Raises:
            ProviderError: 浏览器不可用、超时、执行失败或结果不可信。
        """
        selected_filters = filters or SearchFilters()
        payload: dict[str, JsonValue] = {
            "keyword": keyword,
            "filters": selected_filters.model_dump(mode="json"),
        }
        return await self._execution.execute(
            BrowserTaskKind.SEARCH_FEEDS,
            payload,
            request_id,
            FeedListResult,
            lambda value: value.source == "search" and value.keyword == keyword,
            "搜索结果关键词或来源与请求不一致",
        )

    async def get_feed_detail(
        self,
        feed_id: str,
        xsec_token: str,
        *,
        comment_limit: int = 10,
        include_replies: bool = False,
        reply_limit: int = 10,
        request_id: str | None = None,
    ) -> FeedDetailResult:
        """读取帖子详情并核对帖子标识。

        Args:
            feed_id: 请求的帖子标识。
            xsec_token: 页面导航所需的短期令牌。
            comment_limit: 最多读取的一级评论数。
            include_replies: 是否读取已展开回复。
            reply_limit: 每条一级评论最多读取的回复数。
            request_id: 可选的调用方幂等请求标识。

        Returns:
            与请求帖子标识一致的详情结果。

        Raises:
            ProviderError: 浏览器不可用、超时、执行失败或结果不可信。
        """
        return await self._execution.execute(
            BrowserTaskKind.GET_FEED_DETAIL,
            {
                "feed_id": feed_id,
                "xsec_token": xsec_token,
                "comment_limit": comment_limit,
                "include_replies": include_replies,
                "reply_limit": reply_limit,
            },
            request_id,
            FeedDetailResult,
            lambda value: value.feed_id == feed_id,
            "详情结果与请求的帖子不一致",
        )

    async def get_user_profile(
        self,
        user_id: str,
        xsec_token: str,
        request_id: str | None = None,
    ) -> UserProfileResult:
        """读取指定用户主页并核对用户标识。

        Args:
            user_id: 请求的用户标识。
            xsec_token: 页面导航所需的短期令牌。
            request_id: 可选的调用方幂等请求标识。

        Returns:
            与请求用户标识一致的主页结果。

        Raises:
            ProviderError: 浏览器不可用、超时、执行失败或结果不可信。
        """
        return await self._execution.execute(
            BrowserTaskKind.GET_USER_PROFILE,
            {"user_id": user_id, "xsec_token": xsec_token},
            request_id,
            UserProfileResult,
            lambda value: value.user_id == user_id,
            "主页结果与请求的用户不一致",
        )

    async def get_my_profile(
        self,
        request_id: str | None = None,
    ) -> UserProfileResult:
        """读取当前登录账号主页。

        Args:
            request_id: 可选的调用方幂等请求标识。

        Returns:
            包含明确用户标识的当前账号主页结果。

        Raises:
            ProviderError: 浏览器不可用、超时、执行失败或结果不可信。
        """
        return await self._execution.execute(
            BrowserTaskKind.GET_MY_PROFILE,
            {},
            request_id,
            UserProfileResult,
            lambda value: bool(value.user_id),
            "当前账号主页结果缺少用户标识",
        )
