"""浏览器任务领域模型与纯状态规则。"""

from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, Field, JsonValue


class BrowserTaskKind(StrEnum):
    """浏览器扩展可执行的任务类型。"""

    CHECK_LOGIN_STATUS = "check_login_status"
    GET_LOGIN_QRCODE = "get_login_qrcode"
    DELETE_COOKIES = "delete_cookies"
    LIST_FEEDS = "list_feeds"
    SEARCH_FEEDS = "search_feeds"
    GET_FEED_DETAIL = "get_feed_detail"
    GET_USER_PROFILE = "get_user_profile"
    GET_MY_PROFILE = "get_my_profile"
    SET_LIKE = "set_like"
    SET_FAVORITE = "set_favorite"
    POST_COMMENT = "post_comment"
    REPLY_COMMENT = "reply_comment"


class BrowserTaskStatus(StrEnum):
    """通用浏览器任务状态。"""

    QUEUED = "queued"
    CLAIMED = "claimed"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    NEEDS_REVIEW = "needs_review"


class BrowserTask(BaseModel):
    """由本地服务持久化并交给浏览器扩展执行的任务。

    Attributes:
        task_id: 服务端生成的任务唯一标识。
        request_id: 调用方提供的幂等请求标识。
        kind: 浏览器操作类型。
        payload: 提交时冻结的结构化输入。
        status: 当前任务状态。
        result: 扩展回传并通过 JSON 边界验证的结果。
        extension_id: 当前持有租约的扩展实例。
        lease_expires_at: 当前租约失效时间。
        attempts: 被扩展领取的次数。
        message: 面向用户的状态说明。
        created_at: 任务创建时间。
        updated_at: 任务最近更新时间。
    """

    task_id: str = Field(min_length=1, max_length=128)
    request_id: str | None = Field(default=None, max_length=128)
    kind: BrowserTaskKind
    payload: dict[str, JsonValue] = Field(default_factory=dict)
    status: BrowserTaskStatus = BrowserTaskStatus.QUEUED
    result: dict[str, JsonValue] | None = None
    extension_id: str | None = Field(default=None, max_length=128)
    lease_expires_at: datetime | None = None
    attempts: int = Field(default=0, ge=0)
    message: str = Field(default="等待浏览器扩展执行", max_length=1000)
    created_at: datetime
    updated_at: datetime


class BrowserTaskClaim(BaseModel):
    """扩展领取浏览器任务后获得的短期执行凭据。"""

    task: BrowserTask
    lease_token: str = Field(min_length=32, max_length=256)


def can_retry_browser_task(task: BrowserTask) -> bool:
    """判断任务是否允许显式重新排队。

    明确失败表示外部操作未发生，可以重试；结果不确定的任务必须先人工
    核对，避免评论、回复等写操作被重复执行。

    Args:
        task: 待判断的浏览器任务。

    Returns:
        任务处于明确失败状态时返回真。
    """
    return task.status is BrowserTaskStatus.FAILED
