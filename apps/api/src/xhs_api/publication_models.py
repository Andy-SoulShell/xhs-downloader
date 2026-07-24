"""内容发布 HTTP 请求与响应模型。"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator
from xhs_core.domain import PublicationMode, PublicationTaskStatus


class DraftCreateRequest(BaseModel):
    """新建发布草稿请求。"""

    model_config = ConfigDict(extra="forbid")

    title: str = Field(default="", max_length=100)
    body: str = Field(default="", max_length=5000)
    tags: list[str] = Field(default_factory=list, max_length=20)


class DraftUpdateRequest(DraftCreateRequest):
    """更新发布草稿请求。"""

    asset_order: list[str] | None = Field(default=None, max_length=20)


class TaskSubmitRequest(BaseModel):
    """提交手动或定时发布任务。"""

    model_config = ConfigDict(extra="forbid")

    mode: PublicationMode
    scheduled_at: datetime | None = None

    @model_validator(mode="after")
    def validate_schedule(self) -> "TaskSubmitRequest":
        """确保定时任务明确提供带时区的发布时间。

        Returns:
            通过模式与时间组合校验的请求。
        """
        if self.mode is PublicationMode.SCHEDULED and not self.scheduled_at:
            raise ValueError("定时发布必须指定计划时间")
        if self.mode is PublicationMode.MANUAL and self.scheduled_at:
            raise ValueError("手动发布不接受计划时间")
        return self


class ExtensionRegisterRequest(BaseModel):
    """扩展能力登记请求。"""

    model_config = ConfigDict(extra="forbid")

    extension_id: str = Field(
        min_length=1,
        max_length=128,
        pattern=r"^[A-Za-z0-9._-]+$",
    )


class ExtensionTokenResponse(BaseModel):
    """仅在登记时返回一次的扩展能力令牌。"""

    extension_id: str
    token: str


class PublicationClaimRequest(BaseModel):
    """扩展领取就绪任务请求。"""

    model_config = ConfigDict(extra="forbid")

    preferred_task_id: str | None = Field(
        default=None,
        min_length=1,
        max_length=128,
    )


class PublicationEventRequest(BaseModel):
    """扩展回传发布阶段请求。"""

    model_config = ConfigDict(extra="forbid")

    status: PublicationTaskStatus
    message: str = Field(min_length=1, max_length=1000)
    result_url: str | None = Field(default=None, max_length=2048)
