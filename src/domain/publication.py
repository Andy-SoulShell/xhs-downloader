"""内容发布领域模型。"""

from datetime import datetime
from enum import StrEnum
from hashlib import sha256
from json import dumps

from pydantic import BaseModel, Field, field_validator


class PublicationMode(StrEnum):
    """发布触发方式。"""

    MANUAL = "manual"
    SCHEDULED = "scheduled"


class PublicationTaskStatus(StrEnum):
    """发布任务状态。"""

    SCHEDULED = "scheduled"
    READY = "ready"
    CLAIMED = "claimed"
    FILLING = "filling"
    PUBLISHING = "publishing"
    PUBLISHED = "published"
    NEEDS_REVIEW = "needs_review"
    FAILED = "failed"
    CANCELED = "canceled"


class PublicationAsset(BaseModel):
    """发布包中的一个本地媒体文件。

    Attributes:
        asset_id: 素材唯一标识。
        filename: 经过清理的原始文件名。
        media_type: 浏览器上传时使用的 MIME 类型。
        size: 文件字节数。
        sha256: 完整文件内容摘要。
        position: 素材在发布包中的顺序。
    """

    asset_id: str = Field(min_length=1, max_length=128)
    filename: str = Field(min_length=1, max_length=255)
    media_type: str = Field(pattern=r"^(image|video)/")
    size: int = Field(ge=1)
    sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    position: int = Field(ge=0)


class PublicationDraft(BaseModel):
    """可反复编辑并提交为不可变发布包的草稿。"""

    draft_id: str = Field(min_length=1, max_length=128)
    title: str = Field(default="", max_length=100)
    body: str = Field(default="", max_length=5000)
    tags: list[str] = Field(default_factory=list, max_length=20)
    assets: list[PublicationAsset] = Field(default_factory=list, max_length=20)
    created_at: datetime
    updated_at: datetime

    @field_validator("tags")
    @classmethod
    def normalize_tags(cls, values: list[str]) -> list[str]:
        """清理标签并保持原有顺序。

        Args:
            values: 用户输入的标签。

        Returns:
            去除井号、空白和重复项后的标签。
        """
        result: list[str] = []
        for value in values:
            cleaned = value.strip().lstrip("#").strip()
            if cleaned and cleaned not in result:
                result.append(cleaned[:50])
        return result

    def fingerprint(self) -> str:
        """计算草稿内容指纹。

        Returns:
            标题、正文、标签和素材摘要的 SHA-256。
        """
        canonical = dumps(
            self.model_dump(
                mode="json",
                include={"title", "body", "tags", "assets"},
            ),
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        )
        return sha256(canonical.encode("utf-8")).hexdigest()


class PublicationTask(BaseModel):
    """由扩展领取并执行的不可变发布任务。

    Attributes:
        task_id: 发布任务唯一标识。
        package: 提交瞬间冻结的发布包。
        mode: 手动立即发布或自动定时发布。
        status: 当前执行状态。
        scheduled_at: 最早允许扩展领取的时间。
        extension_id: 当前持有租约的扩展实例。
        lease_expires_at: 当前租约失效时间。
        attempts: 被扩展领取的次数。
        message: 面向用户的状态说明。
        result_url: 发布成功后的小红书作品地址。
    """

    task_id: str = Field(min_length=1, max_length=128)
    package: PublicationDraft
    package_fingerprint: str = Field(pattern=r"^[0-9a-f]{64}$")
    mode: PublicationMode
    status: PublicationTaskStatus
    scheduled_at: datetime
    extension_id: str | None = Field(default=None, max_length=128)
    lease_expires_at: datetime | None = None
    attempts: int = Field(default=0, ge=0)
    message: str = Field(default="等待发布", max_length=1000)
    result_url: str | None = None
    created_at: datetime
    updated_at: datetime


class PublicationClaim(BaseModel):
    """扩展领取任务后获得的短期执行凭据。"""

    task: PublicationTask
    lease_token: str = Field(min_length=32, max_length=256)
