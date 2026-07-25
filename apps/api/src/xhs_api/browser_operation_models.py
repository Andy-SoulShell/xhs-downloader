"""面向调用方的浏览器能力请求模型。"""

from pydantic import BaseModel, ConfigDict, Field
from xhs_core.domain.browser_requests import SearchFilters


class BrowserOperationRequest(BaseModel):
    """无额外参数的浏览器能力请求。"""

    model_config = ConfigDict(extra="forbid")

    request_id: str | None = Field(default=None, min_length=1, max_length=128)


class SearchFeedsRequest(BrowserOperationRequest):
    """搜索帖子请求。"""

    keyword: str = Field(min_length=1, max_length=200)
    filters: SearchFilters = Field(default_factory=SearchFilters)


class FeedDetailRequest(BrowserOperationRequest):
    """帖子详情与评论读取请求。"""

    feed_id: str = Field(min_length=1, max_length=128)
    xsec_token: str = Field(min_length=1, max_length=2048, repr=False)
    comment_limit: int = Field(default=10, ge=0, le=500)
    include_replies: bool = False
    reply_limit: int = Field(default=10, ge=0, le=200)


class UserProfileRequest(BrowserOperationRequest):
    """指定用户主页读取请求。"""

    user_id: str = Field(min_length=1, max_length=128)
    xsec_token: str = Field(min_length=1, max_length=2048, repr=False)
