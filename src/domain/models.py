"""领域数据模型。"""

from datetime import datetime
from enum import StrEnum
from hashlib import sha256
from json import dumps

from pydantic import BaseModel, ConfigDict, Field


class WorkType(StrEnum):
    """作品类型。"""

    VIDEO = "视频"
    IMAGE = "图文"
    GALLERY = "图集"
    UNKNOWN = "未知"


class MediaKind(StrEnum):
    """媒体资源类型。"""

    VIDEO = "视频"
    IMAGE = "图片"
    LIVE = "动态图片"


class Author(BaseModel):
    """作品作者信息。

    Attributes:
        author_id: 作者在平台内的唯一标识。
        nickname: 作者昵称。
        profile_url: 作者主页地址。
        avatar_url: 作者头像地址；页面未提供时为空。
    """

    model_config = ConfigDict(populate_by_name=True)

    author_id: str = Field(alias="作者ID")
    nickname: str = Field(alias="作者昵称")
    profile_url: str = Field(alias="作者链接")
    avatar_url: str | None = Field(default=None, alias="头像地址")


class MediaResource(BaseModel):
    """一个可下载的媒体资源。

    Attributes:
        index: 媒体在作品中的一基序号。
        kind: 视频、图片或动态图片。
        url: 原始媒体地址。
        suffix: 建议文件扩展名，不包含点号。
        preview_url: 视频封面地址；其他资源不需要。
    """

    model_config = ConfigDict(populate_by_name=True)

    index: int = Field(alias="序号", ge=1)
    kind: MediaKind = Field(alias="类型")
    url: str = Field(alias="地址")
    suffix: str = Field(alias="扩展名")
    preview_url: str | None = Field(default=None, alias="预览地址")


class WorkDetail(BaseModel):
    """完成解析并经过类型验证的作品信息。"""

    model_config = ConfigDict(populate_by_name=True)

    work_id: str = Field(alias="作品ID")
    source_url: str = Field(alias="作品链接")
    title: str = Field(alias="作品标题")
    description: str = Field(alias="作品描述")
    work_type: WorkType = Field(alias="作品类型")
    tags: list[str] = Field(default_factory=list, alias="作品标签")
    published_at: datetime | None = Field(default=None, alias="发布时间")
    updated_at: datetime | None = Field(default=None, alias="最后更新时间")
    liked_count: str = Field(default="-1", alias="点赞数量")
    collected_count: str = Field(default="-1", alias="收藏数量")
    comment_count: str = Field(default="-1", alias="评论数量")
    share_count: str = Field(default="-1", alias="分享数量")
    author: Author = Field(alias="作者")
    media: list[MediaResource] = Field(default_factory=list, alias="媒体")

    def fingerprint(self) -> str:
        """计算决定下载产物有效性的内容指纹。

        Returns:
            标题、作者、发布时间和媒体资源的 SHA-256 指纹。
        """
        payload = self.model_dump(
            mode="json",
            include={
                "work_id",
                "title",
                "published_at",
                "author",
                "media",
            },
        )
        payload["author"].pop("avatar_url", None)
        canonical = dumps(
            payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")
        )
        return sha256(canonical.encode("utf-8")).hexdigest()

    def public_dict(self) -> dict:
        """生成适合用户接口返回的中文字段字典。

        Returns:
            使用字段别名并完成 JSON 类型转换的字典。
        """
        return self.model_dump(mode="json", by_alias=True)


class DownloadArtifact(BaseModel):
    """一个已经完整落盘并校验的文件产物。"""

    path: str
    sha256: str
    size: int = Field(ge=0)
    media_index: int = Field(ge=1)
    kind: MediaKind


class DownloadRecord(BaseModel):
    """用于判断本地产物是否仍然有效的下载记录。"""

    work_id: str
    source_fingerprint: str
    artifacts: list[DownloadArtifact]
    updated_at: datetime


class DownloadOutcome(BaseModel):
    """一次下载用例的完整结果。"""

    message: str
    detail: WorkDetail
    artifacts: list[DownloadArtifact] = Field(default_factory=list)
    skipped: bool = False
