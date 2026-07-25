"""统一读取运行时的账号范围接线测试。"""

from typing import cast

from xhs_adapters import HttpReadProvider
from xhs_adapters.config import AppSettings
from xhs_api.capability_runtime import ReadCapabilityRuntime
from xhs_core.application import BrowserReadProvider
from xhs_core.domain import (
    AccountConsistencyStatus,
    FeedAuthor,
    FeedDetailResult,
    FeedListResult,
    ProviderError,
    ProviderFailureCode,
    ProviderKind,
    RouteStrategy,
    UserProfileResult,
)
from xhs_core.domain.browser_requests import SearchFilters


class _RejectingHttp:
    """让每项只读能力都以可安全回退分类失败。"""

    async def close(self) -> None:
        """关闭不持有资源的测试 Provider。"""

    async def list_feeds(self):
        """拒绝推荐读取。"""
        raise _failure()

    async def search_feeds(self, keyword, filters):
        """拒绝搜索读取。

        Args:
            keyword: 合成关键词。
            filters: 合成搜索筛选。
        """
        del keyword, filters
        raise _failure()

    async def get_feed_detail(self, feed_id, xsec_token, **options):
        """拒绝详情读取。

        Args:
            feed_id: 合成帖子标识。
            xsec_token: 合成访问令牌。
            **options: 合成详情选项。
        """
        del feed_id, xsec_token, options
        raise _failure()

    async def get_user_profile(self, user_id, xsec_token):
        """拒绝指定主页读取。

        Args:
            user_id: 合成用户标识。
            xsec_token: 合成访问令牌。
        """
        del user_id, xsec_token
        raise _failure()

    async def get_my_profile(self):
        """拒绝当前主页读取。"""
        raise _failure()


class _Browser:
    """为五项只读能力返回合成浏览器结果。"""

    async def list_feeds(self, request_id=None):
        """返回合成推荐列表。"""
        del request_id
        return FeedListResult(source="home")

    async def search_feeds(self, keyword, filters, request_id=None):
        """返回合成搜索列表。"""
        del filters, request_id
        return FeedListResult(source="search", keyword=keyword)

    async def get_feed_detail(
        self,
        feed_id,
        xsec_token,
        *,
        request_id=None,
        **options,
    ):
        """返回合成帖子详情。"""
        del request_id, options
        return FeedDetailResult(
            feed_id=feed_id,
            xsec_token=xsec_token,
            author=FeedAuthor(user_id="synthetic-author"),
        )

    async def get_user_profile(self, user_id, xsec_token, request_id=None):
        """返回合成指定用户主页。"""
        del xsec_token, request_id
        return UserProfileResult(user_id=user_id)

    async def get_my_profile(self, request_id=None):
        """返回合成当前账号主页。"""
        del request_id
        return UserProfileResult(user_id="synthetic-current")


class _Guard:
    """记录每次受保护回退。"""

    def __init__(self) -> None:
        self.calls = 0

    async def verify(self) -> AccountConsistencyStatus:
        """确认合成账号一致。

        Returns:
            固定一致结论。
        """
        self.calls += 1
        return AccountConsistencyStatus.MATCHED


async def test_all_current_read_schemas_guard_cross_provider_fallback() -> None:
    """确保含账号互动状态的五项读取均不会绕过一致性门禁。"""
    guard = _Guard()
    runtime = ReadCapabilityRuntime(
        AppSettings(route_strategy=RouteStrategy.HTTP_FIRST),
        cast(HttpReadProvider, _RejectingHttp()),
        cast(BrowserReadProvider, _Browser()),
        guard,
    )

    results = [
        await runtime.list_feeds(),
        await runtime.search_feeds("合成关键词", SearchFilters()),
        await runtime.get_feed_detail(
            "synthetic-feed",
            "synthetic-token",
            comment_limit=0,
            include_replies=False,
            reply_limit=0,
        ),
        await runtime.get_user_profile("synthetic-user", "synthetic-token"),
        await runtime.get_my_profile(),
    ]

    assert guard.calls == 5
    assert all(
        result.account_consistency is AccountConsistencyStatus.MATCHED
        for result in results
    )


def _failure() -> ProviderError:
    return ProviderError(
        ProviderKind.HTTP,
        ProviderFailureCode.UNSUPPORTED,
        "HTTP 合成能力暂不支持",
    )
