"""浏览器任务 HTTP 请求模型。"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, JsonValue
from xhs_core.domain import BrowserTaskKind, BrowserTaskStatus


class BrowserTaskRequest(BaseModel):
    """本机调用方提交的浏览器任务。"""

    model_config = ConfigDict(extra="forbid")

    kind: BrowserTaskKind
    payload: dict[str, JsonValue] = Field(default_factory=dict)
    request_id: str | None = Field(default=None, min_length=1, max_length=128)


class BrowserTaskStatusRequest(BaseModel):
    """扩展回传的浏览器任务运行状态。"""

    model_config = ConfigDict(extra="forbid")

    status: Literal[BrowserTaskStatus.RUNNING]
    message: str = Field(min_length=1, max_length=1000)


class BrowserTaskResultRequest(BaseModel):
    """扩展回传的浏览器任务终态和结构化结果。"""

    model_config = ConfigDict(extra="forbid")

    status: Literal[
        BrowserTaskStatus.SUCCEEDED,
        BrowserTaskStatus.FAILED,
        BrowserTaskStatus.NEEDS_REVIEW,
    ]
    message: str = Field(min_length=1, max_length=1000)
    result: dict[str, JsonValue] | None = None


class BrowserExtensionRegisterRequest(BaseModel):
    """浏览器任务扩展登记请求。"""

    model_config = ConfigDict(extra="forbid")

    extension_id: str = Field(min_length=1, max_length=128)


class BrowserExtensionTokenResponse(BaseModel):
    """只在登记响应中返回一次的扩展能力凭据。"""

    model_config = ConfigDict(extra="forbid")

    extension_id: str
    token: str


class BrowserExtensionStatus(BaseModel):
    """供本机管理界面展示的扩展在线状态。"""

    model_config = ConfigDict(extra="forbid")

    extension_id: str
    registered_at: datetime
    last_seen_at: datetime
    online: bool
