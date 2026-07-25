"""面向调用方的浏览器能力请求模型。"""

from pydantic import BaseModel, ConfigDict, Field, model_validator
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


class DesiredStateRequest(BrowserOperationRequest):
    """点赞或收藏目标状态请求。"""

    feed_id: str = Field(min_length=1, max_length=128)
    xsec_token: str = Field(min_length=1, max_length=2048, repr=False)
    active: bool


class CommentRequest(BrowserOperationRequest):
    """发表评论请求。"""

    feed_id: str = Field(min_length=1, max_length=128)
    xsec_token: str = Field(min_length=1, max_length=2048, repr=False)
    content: str = Field(min_length=1, max_length=1000, repr=False)


class ReplyCommentRequest(CommentRequest):
    """回复评论请求。"""

    comment_id: str | None = Field(default=None, min_length=1, max_length=128)
    user_id: str | None = Field(default=None, min_length=1, max_length=128)

    @model_validator(mode="after")
    def validate_target(self) -> "ReplyCommentRequest":
        """确保回复请求至少包含一种稳定定位方式。

        Returns:
            已通过目标组合校验的请求。
        """
        if not self.comment_id and not self.user_id:
            raise ValueError("回复评论必须提供 comment_id 或 user_id")
        return self
