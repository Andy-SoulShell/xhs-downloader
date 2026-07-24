"""HTTP API 请求与响应模型。"""

from pydantic import BaseModel, ConfigDict, Field, SecretStr
from xhs_adapters.config import ImageFormat, VideoPreference
from xhs_core.domain import (
    ClientDownloadRecord,
    DownloadArtifact,
    DownloadMode,
)
from xhs_core.version import VERSION


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


class SettingsValues(BaseModel):
    """管理后台可以读取和编辑的非敏感配置。"""

    model_config = ConfigDict(extra="forbid")

    work_path: str | None
    folder_name: str
    name_format: str
    user_agent: str
    timeout: float
    chunk: int
    max_retry: int
    max_concurrency: int
    record_data: bool
    image_format: ImageFormat
    image_download: bool
    video_download: bool
    live_download: bool
    video_preference: VideoPreference
    folder_mode: bool
    download_record: bool
    author_archive: bool
    write_mtime: bool
    mapping_data: dict[str, str]
    server_host: str
    server_port: int
    log_level: str
    publish_max_asset_size: int
    publish_lease_seconds: int


class SettingsUpdate(BaseModel):
    """配置更新请求；敏感字段仅允许写入或显式清空。"""

    model_config = ConfigDict(extra="forbid")

    work_path: str | None = None
    folder_name: str | None = None
    name_format: str | None = None
    user_agent: str | None = None
    cookie: SecretStr | None = Field(default=None, repr=False)
    proxy: SecretStr | None = Field(default=None, repr=False)
    timeout: float | None = Field(default=None, gt=0, le=120)
    chunk: int | None = Field(default=None, ge=64 * 1024)
    max_retry: int | None = Field(default=None, ge=0, le=10)
    max_concurrency: int | None = Field(default=None, ge=1, le=16)
    record_data: bool | None = None
    image_format: ImageFormat | None = None
    image_download: bool | None = None
    video_download: bool | None = None
    live_download: bool | None = None
    video_preference: VideoPreference | None = None
    folder_mode: bool | None = None
    download_record: bool | None = None
    author_archive: bool | None = None
    write_mtime: bool | None = None
    mapping_data: dict[str, str] | None = None
    server_host: str | None = None
    server_port: int | None = Field(default=None, ge=1, le=65535)
    log_level: str | None = None
    publish_max_asset_size: int | None = Field(
        default=None,
        ge=1024 * 1024,
        le=10 * 1024 * 1024 * 1024,
    )
    publish_lease_seconds: int | None = Field(
        default=None,
        ge=60,
        le=1800,
    )


class SettingsResponse(BaseModel):
    """不泄露 Cookie 与代理内容的配置响应。"""

    model_config = ConfigDict(extra="forbid")

    values: SettingsValues
    config_file: str
    restart_required: bool
    overridden_fields: list[str]
    cookie_configured: bool
    proxy_configured: bool
