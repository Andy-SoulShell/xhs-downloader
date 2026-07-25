"""普通用户登录与 Cookie 管理接口模型。"""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from xhs_core.domain import BrowserTaskStatus

from .browser_operation_models import BrowserOperationRequest


class DeleteCookiesRequest(BrowserOperationRequest):
    """按会话目标清理 Cookie 的显式确认请求。"""

    target: Literal["browser", "http"] = "browser"
    confirmed: Literal[True]


class DeleteCookiesResponse(BaseModel):
    """Cookie 清理结果或正在执行的浏览器任务摘要。"""

    model_config = ConfigDict(extra="forbid")

    target: Literal["browser", "http"]
    status: BrowserTaskStatus
    deleted: bool
    message: str = Field(min_length=1, max_length=1000)
    task_id: str | None = None
    restart_required: bool = False
