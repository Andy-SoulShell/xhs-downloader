"""HTTP API 请求与响应模型。"""

from pydantic import BaseModel, ConfigDict, Field

from src.domain import (
    ClientDownloadRecord,
    DownloadArtifact,
    DownloadMode,
)
from src.version import VERSION


class DetailRequest(BaseModel):
    """作品详情与下载请求。"""

    model_config = ConfigDict(extra="forbid")

    url: str = Field(description="小红书作品链接")
    download: bool = Field(default=False, description="是否下载媒体文件")
    index: list[int] | None = Field(default=None, description="指定图片序号")
    cookie: str | None = Field(
        default=None,
        description="仅用于本次请求的 Cookie",
        repr=False,
    )
    force: bool = Field(default=False, description="是否强制重新下载")


class DetailResponse(BaseModel):
    """作品详情与下载响应。"""

    model_config = ConfigDict(extra="forbid")

    message: str
    data: dict | None = None
    files: list[DownloadArtifact] = Field(default_factory=list)
    skipped: bool = False


class ExtensionCapabilities(BaseModel):
    """浏览器扩展可依赖的服务能力。"""

    model_config = ConfigDict(extra="forbid")

    protocol_version: int = 1
    service_version: str = VERSION
    download_modes: list[DownloadMode]
    features: dict[str, bool]


class ClientRecordBatch(BaseModel):
    """浏览器扩展同步的一批下载记录。"""

    model_config = ConfigDict(extra="forbid")

    records: list[ClientDownloadRecord] = Field(max_length=200)


class TaskRequest(BaseModel):
    """后台下载任务提交请求。"""

    model_config = ConfigDict(extra="forbid")

    url: str = Field(description="小红书作品链接")
    index: list[int] = Field(default_factory=list, description="指定媒体序号")
    force: bool = Field(default=False, description="是否强制重新下载")
    request_id: str | None = Field(
        default=None,
        min_length=1,
        max_length=128,
        description="客户端幂等请求标识",
    )
