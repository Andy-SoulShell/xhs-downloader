"""浏览器任务领域模型与纯状态规则。"""

from datetime import datetime
from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, JsonValue


class BrowserTaskKind(StrEnum):
    """浏览器驱动可执行的任务类型。"""

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


class BrowserDriver(StrEnum):
    """浏览器任务的固定执行驱动。"""

    EXTENSION = "extension"
    MANAGED = "managed"


class BrowserTask(BaseModel):
    """由本地服务持久化并交给指定浏览器驱动执行的任务。

    Attributes:
        task_id: 服务端生成的任务唯一标识。
        request_id: 调用方提供的幂等请求标识。
        kind: 浏览器操作类型。
        payload: 提交时冻结的结构化输入。
        target_driver: 提交时冻结的执行驱动。
        status: 当前任务状态。
        result: 执行器回传并通过 JSON 边界验证的结果。
        executor_id: 当前持有租约的执行器实例。
        extension_id: 当前持有租约的扩展实例。
        lease_expires_at: 当前租约失效时间。
        attempts: 被浏览器执行器领取的次数。
        message: 面向用户的状态说明。
        created_at: 任务创建时间。
        updated_at: 任务最近更新时间。
    """

    task_id: str = Field(min_length=1, max_length=128)
    request_id: str | None = Field(default=None, max_length=128)
    kind: BrowserTaskKind
    payload: dict[str, JsonValue] = Field(default_factory=dict)
    target_driver: BrowserDriver = BrowserDriver.EXTENSION
    status: BrowserTaskStatus = BrowserTaskStatus.QUEUED
    result: dict[str, JsonValue] | None = None
    executor_id: str | None = Field(default=None, max_length=128)
    extension_id: str | None = Field(default=None, max_length=128)
    lease_expires_at: datetime | None = None
    attempts: int = Field(default=0, ge=0)
    message: str = Field(default="等待浏览器执行", max_length=1000)
    created_at: datetime
    updated_at: datetime


class BrowserTaskClaim(BaseModel):
    """浏览器执行器领取任务后获得的短期执行凭据。

    Attributes:
        task: 已进入领取态的任务快照。
        lease_token: 仅当前执行器可使用的租约令牌。
        lease_seconds: 服务端配置的完整租约时长，用于安排安全续租。
    """

    task: BrowserTask
    lease_token: str = Field(min_length=32, max_length=256)
    lease_seconds: float = Field(default=30, ge=0.01, le=3600)


class BrowserTaskExecutionResult(BaseModel):
    """浏览器执行器返回的结构化终态。

    Attributes:
        status: 已确认的成功、失败或需要人工核对状态。
        message: 不包含用户原文和敏感请求数据的执行摘要。
        result: 可选的结构化结果或脱敏诊断。
    """

    model_config = ConfigDict(extra="forbid")

    status: Literal[
        BrowserTaskStatus.SUCCEEDED,
        BrowserTaskStatus.FAILED,
        BrowserTaskStatus.NEEDS_REVIEW,
    ]
    message: str = Field(min_length=1, max_length=1000)
    result: dict[str, JsonValue] | None = None


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


def browser_task_may_write_platform(kind: BrowserTaskKind) -> bool:
    """判断任务是否可能改变小红书平台状态。

    规则采用保守白名单：只有已知的登录、读取和本地 Cookie 清理任务
    被视为不会写入平台。以后新增的任务类型默认按可能写入处理，避免
    执行中断后被误判为可以安全重试。

    Args:
        kind: 浏览器任务类型。

    Returns:
        任务可能已经产生平台写入时返回真。
    """
    safe_kinds = {
        BrowserTaskKind.CHECK_LOGIN_STATUS,
        BrowserTaskKind.GET_LOGIN_QRCODE,
        BrowserTaskKind.DELETE_COOKIES,
        BrowserTaskKind.LIST_FEEDS,
        BrowserTaskKind.SEARCH_FEEDS,
        BrowserTaskKind.GET_FEED_DETAIL,
        BrowserTaskKind.GET_USER_PROFILE,
        BrowserTaskKind.GET_MY_PROFILE,
    }
    return kind not in safe_kinds


# 受管浏览器当前实现的任务类型。
# 扩展驱动实现全部类型。
# 受管驱动新增能力时同步扩充。
_MANAGED_BROWSER_KINDS = frozenset(
    {
        BrowserTaskKind.CHECK_LOGIN_STATUS,
        BrowserTaskKind.GET_LOGIN_QRCODE,
        BrowserTaskKind.DELETE_COOKIES,
        BrowserTaskKind.LIST_FEEDS,
        BrowserTaskKind.SEARCH_FEEDS,
        BrowserTaskKind.GET_FEED_DETAIL,
        BrowserTaskKind.GET_USER_PROFILE,
        BrowserTaskKind.GET_MY_PROFILE,
        BrowserTaskKind.SET_LIKE,
        BrowserTaskKind.SET_FAVORITE,
    }
)


def browser_driver_supports(driver: BrowserDriver, kind: BrowserTaskKind) -> bool:
    """判断驱动是否实现了该任务类型。

    调用方据此在提交阶段就拒绝无法执行的组合，避免任务先入队、
    再由执行器领取后才失败。

    Args:
        driver: 目标浏览器执行驱动。
        kind: 浏览器任务类型。

    Returns:
        该驱动能够执行此类型任务时返回真。
    """
    if driver is BrowserDriver.MANAGED:
        return kind in _MANAGED_BROWSER_KINDS
    return True
