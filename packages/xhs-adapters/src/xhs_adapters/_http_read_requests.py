"""HTTP 读取能力的受限输入和站内地址构造。"""

from urllib.parse import quote, urlencode

from pydantic import ValidationError
from xhs_core.domain import ProviderError, ProviderFailureCode, ProviderKind
from xhs_core.domain.browser_requests import (
    FeedDetailPayload,
    SearchFeedsPayload,
    SearchFilters,
    UserProfilePayload,
)

_ORIGIN = "https://www.xiaohongshu.com"
EXPLORE_URL = f"{_ORIGIN}/explore/"


def validate_search_payload(
    keyword: str,
    filters: SearchFilters,
) -> SearchFeedsPayload:
    """验证 HTTP 搜索输入。

    Args:
        keyword: 搜索关键词。
        filters: 结构化筛选条件。

    Returns:
        具有完整默认值的搜索输入。

    Raises:
        ProviderError: 输入不满足领域约束。
    """
    try:
        return SearchFeedsPayload(keyword=keyword, filters=filters)
    except ValidationError:
        raise _invalid_request("HTTP 搜索请求参数无效") from None


def validate_detail_payload(
    feed_id: str,
    xsec_token: str,
    comment_limit: int,
    include_replies: bool,
    reply_limit: int,
) -> FeedDetailPayload:
    """验证 HTTP 帖子详情输入。

    Args:
        feed_id: 目标帖子 ID。
        xsec_token: 页面访问令牌。
        comment_limit: 一级评论上限。
        include_replies: 是否包含已加载回复。
        reply_limit: 单条评论回复上限。

    Returns:
        具有完整默认值的详情输入。

    Raises:
        ProviderError: 输入不满足领域约束。
    """
    try:
        return FeedDetailPayload(
            feed_id=feed_id,
            xsec_token=xsec_token,
            comment_limit=comment_limit,
            include_replies=include_replies,
            reply_limit=reply_limit,
        )
    except ValidationError:
        raise _invalid_request("HTTP 详情请求参数无效") from None


def validate_profile_payload(
    user_id: str,
    xsec_token: str,
) -> UserProfilePayload:
    """验证 HTTP 用户主页输入。

    Args:
        user_id: 目标用户 ID。
        xsec_token: 页面访问令牌。

    Returns:
        验证后的用户主页输入。

    Raises:
        ProviderError: 输入不满足领域约束。
    """
    try:
        return UserProfilePayload(user_id=user_id, xsec_token=xsec_token)
    except ValidationError:
        raise _invalid_request("HTTP 用户主页请求参数无效") from None


def build_search_url(keyword: str) -> str:
    """构造默认筛选搜索页地址。

    Args:
        keyword: 已验证的搜索关键词。

    Returns:
        仅指向小红书主站的编码地址。
    """
    query = urlencode({"keyword": keyword, "source": "web_explore_feed"})
    return f"{_ORIGIN}/search_result?{query}"


def build_detail_url(payload: FeedDetailPayload) -> str:
    """构造帖子详情页地址。

    Args:
        payload: 已验证的详情输入。

    Returns:
        编码帖子 ID 和令牌后的主站地址。
    """
    feed_segment = quote(payload.feed_id, safe="").replace(".", "%2E")
    query = urlencode({"xsec_token": payload.xsec_token, "xsec_source": "pc_feed"})
    return f"{_ORIGIN}/explore/{feed_segment}?{query}"


def build_profile_url(user_id: str, xsec_token: str | None) -> str:
    """构造指定或当前账号主页地址。

    Args:
        user_id: 已严格识别或验证的用户 ID。
        xsec_token: 指定用户的访问令牌；当前账号可为空。

    Returns:
        编码目标 ID 和可选令牌后的主站地址。
    """
    user_segment = quote(user_id, safe="").replace(".", "%2E")
    if xsec_token is None:
        return f"{_ORIGIN}/user/profile/{user_segment}"
    query = urlencode({"xsec_token": xsec_token, "xsec_source": "pc_note"})
    return f"{_ORIGIN}/user/profile/{user_segment}?{query}"


def _invalid_request(message: str) -> ProviderError:
    return ProviderError(
        ProviderKind.HTTP,
        ProviderFailureCode.INVALID_RESULT,
        message,
    )
