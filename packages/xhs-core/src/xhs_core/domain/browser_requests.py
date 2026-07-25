"""浏览器任务输入验证与结果模型路由。"""

from typing import Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    JsonValue,
    ValidationError,
    model_validator,
)

from .browser_sessions import BrowserCookieDeletionResult, LoginQrCodeResult
from .browser_tasks import BrowserTaskKind
from .errors import BrowserTaskError
from .feeds import (
    BrowserAccount,
    FeedDetailResult,
    FeedListResult,
    UserProfileResult,
)


class EmptyBrowserPayload(BaseModel):
    """不需要参数的浏览器任务输入。"""

    model_config = ConfigDict(extra="forbid")


class DeleteCookiesPayload(BaseModel):
    """清理浏览器 Cookie 的显式确认输入。"""

    model_config = ConfigDict(extra="forbid")

    confirmed: Literal[True]


class SearchFilters(BaseModel):
    """搜索页支持的可选筛选条件。"""

    model_config = ConfigDict(extra="forbid")

    sort_by: Literal["综合", "最新", "最多点赞", "最多评论", "最多收藏"] = "综合"
    note_type: Literal["不限", "视频", "图文"] = "不限"
    publish_time: Literal["不限", "一天内", "一周内", "半年内"] = "不限"
    search_scope: Literal["不限", "已看过", "未看过", "已关注"] = "不限"
    location: Literal["不限", "同城", "附近"] = "不限"


class SearchFeedsPayload(BaseModel):
    """搜索帖子任务输入。"""

    model_config = ConfigDict(extra="forbid")

    keyword: str = Field(min_length=1, max_length=200)
    filters: SearchFilters = Field(default_factory=SearchFilters)


class FeedDetailPayload(BaseModel):
    """帖子详情与评论读取任务输入。"""

    model_config = ConfigDict(extra="forbid")

    feed_id: str = Field(min_length=1, max_length=128)
    xsec_token: str = Field(min_length=1, max_length=2048, repr=False)
    comment_limit: int = Field(default=10, ge=0, le=500)
    include_replies: bool = False
    reply_limit: int = Field(default=10, ge=0, le=200)


class UserProfilePayload(BaseModel):
    """指定用户主页读取任务输入。"""

    model_config = ConfigDict(extra="forbid")

    user_id: str = Field(min_length=1, max_length=128)
    xsec_token: str = Field(min_length=1, max_length=2048, repr=False)


class DesiredStatePayload(BaseModel):
    """点赞或收藏目标状态任务输入。"""

    model_config = ConfigDict(extra="forbid")

    feed_id: str = Field(min_length=1, max_length=128)
    xsec_token: str = Field(min_length=1, max_length=2048, repr=False)
    active: bool


class CommentPayload(BaseModel):
    """发表评论任务输入。"""

    model_config = ConfigDict(extra="forbid")

    feed_id: str = Field(min_length=1, max_length=128)
    xsec_token: str = Field(min_length=1, max_length=2048, repr=False)
    content: str = Field(min_length=1, max_length=1000, repr=False)


class ReplyCommentPayload(CommentPayload):
    """回复指定评论任务输入。"""

    comment_id: str | None = Field(default=None, min_length=1, max_length=128)
    user_id: str | None = Field(default=None, min_length=1, max_length=128)

    @model_validator(mode="after")
    def _require_reply_target(self) -> "ReplyCommentPayload":
        if not self.comment_id and not self.user_id:
            raise ValueError("回复评论必须提供 comment_id 或 user_id")
        return self


class DesiredStateResult(BaseModel):
    """点赞或收藏任务的核验结果。"""

    model_config = ConfigDict(extra="forbid")

    feed_id: str
    active: bool
    changed: bool
    verified: Literal[True]


class CommentResult(BaseModel):
    """评论或回复任务的核验结果。"""

    model_config = ConfigDict(extra="forbid")

    feed_id: str
    comment_id: str | None = None
    verified: Literal[True]


_PAYLOAD_MODELS: dict[BrowserTaskKind, type[BaseModel]] = {
    BrowserTaskKind.CHECK_LOGIN_STATUS: EmptyBrowserPayload,
    BrowserTaskKind.GET_LOGIN_QRCODE: EmptyBrowserPayload,
    BrowserTaskKind.DELETE_COOKIES: DeleteCookiesPayload,
    BrowserTaskKind.LIST_FEEDS: EmptyBrowserPayload,
    BrowserTaskKind.SEARCH_FEEDS: SearchFeedsPayload,
    BrowserTaskKind.GET_FEED_DETAIL: FeedDetailPayload,
    BrowserTaskKind.GET_USER_PROFILE: UserProfilePayload,
    BrowserTaskKind.GET_MY_PROFILE: EmptyBrowserPayload,
    BrowserTaskKind.SET_LIKE: DesiredStatePayload,
    BrowserTaskKind.SET_FAVORITE: DesiredStatePayload,
    BrowserTaskKind.POST_COMMENT: CommentPayload,
    BrowserTaskKind.REPLY_COMMENT: ReplyCommentPayload,
}

_RESULT_MODELS: dict[BrowserTaskKind, type[BaseModel]] = {
    BrowserTaskKind.CHECK_LOGIN_STATUS: BrowserAccount,
    BrowserTaskKind.GET_LOGIN_QRCODE: LoginQrCodeResult,
    BrowserTaskKind.DELETE_COOKIES: BrowserCookieDeletionResult,
    BrowserTaskKind.LIST_FEEDS: FeedListResult,
    BrowserTaskKind.SEARCH_FEEDS: FeedListResult,
    BrowserTaskKind.GET_FEED_DETAIL: FeedDetailResult,
    BrowserTaskKind.GET_USER_PROFILE: UserProfileResult,
    BrowserTaskKind.GET_MY_PROFILE: UserProfileResult,
    BrowserTaskKind.SET_LIKE: DesiredStateResult,
    BrowserTaskKind.SET_FAVORITE: DesiredStateResult,
    BrowserTaskKind.POST_COMMENT: CommentResult,
    BrowserTaskKind.REPLY_COMMENT: CommentResult,
}


def validate_browser_task_payload(
    kind: BrowserTaskKind,
    payload: dict[str, JsonValue],
) -> dict[str, JsonValue]:
    """验证并规范化浏览器任务输入。

    Args:
        kind: 浏览器任务类型。
        payload: 尚未信任的 JSON 输入。

    Returns:
        包含显式默认值的冻结输入。

    Raises:
        BrowserTaskError: 输入不符合对应任务结构。
    """
    return _validate(_PAYLOAD_MODELS[kind], payload, "浏览器任务参数无效")


def validate_browser_task_result(
    kind: BrowserTaskKind,
    result: dict[str, JsonValue],
) -> dict[str, JsonValue]:
    """验证并规范化扩展回传结果。

    Args:
        kind: 浏览器任务类型。
        result: 扩展回传的 JSON 对象。

    Returns:
        通过对应结果模型验证的数据。

    Raises:
        BrowserTaskError: 结果不符合对应任务结构。
    """
    return _validate(_RESULT_MODELS[kind], result, "浏览器任务结果结构无效")


def _validate(
    model: type[BaseModel],
    value: dict[str, JsonValue],
    message: str,
) -> dict[str, JsonValue]:
    try:
        return model.model_validate(value).model_dump(mode="json")
    except ValidationError as error:
        raise BrowserTaskError(message) from error
