"""应用配置模型与环境变量加载入口。"""

from enum import StrEnum
from pathlib import Path
from typing import Any

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/136.0.0.0 Safari/537.36"
)


class ImageFormat(StrEnum):
    """图片下载格式。"""

    AUTO = "auto"
    PNG = "png"
    WEBP = "webp"
    JPEG = "jpeg"
    HEIC = "heic"
    AVIF = "avif"


class VideoPreference(StrEnum):
    """视频流选择策略。"""

    RESOLUTION = "resolution"
    BITRATE = "bitrate"
    SIZE = "size"


class AppSettings(BaseSettings):
    """集中管理应用配置并提供派生目录。

    配置默认从当前目录的 ``.env`` 和 ``XHS_`` 前缀环境变量读取。环境变量
    优先级高于 dotenv 文件，显式构造参数优先级最高。

    Attributes:
        work_path: 下载数据根目录；为空时使用当前目录的 ``volume``。
        folder_name: 媒体文件目录名称。
        cookie: 小红书网页版 Cookie，日志与模型输出会自动隐藏。
        download_record: 是否启用带指纹校验的下载记录。
        managed_browser_executable: 受管 Chromium 可执行文件；为空时自动检测。
        managed_browser_headless: 是否隐藏受管浏览器窗口。
    """

    model_config = SettingsConfigDict(
        env_prefix="XHS_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    work_path: Path | None = None
    folder_name: str = "download"
    name_format: str = "发布时间 作者昵称 作品标题"
    user_agent: str = DEFAULT_USER_AGENT
    cookie: SecretStr = SecretStr("")
    proxy: str | None = None
    timeout: float = Field(default=15, gt=0, le=120)
    chunk: int = Field(default=2 * 1024 * 1024, ge=64 * 1024)
    max_retry: int = Field(default=3, ge=0, le=10)
    max_concurrency: int = Field(default=4, ge=1, le=16)
    record_data: bool = False
    image_format: ImageFormat = ImageFormat.JPEG
    image_download: bool = True
    video_download: bool = True
    live_download: bool = False
    video_preference: VideoPreference = VideoPreference.RESOLUTION
    folder_mode: bool = False
    download_record: bool = True
    author_archive: bool = False
    write_mtime: bool = False
    mapping_data: dict[str, str] = Field(default_factory=dict)
    server_host: str = "0.0.0.0"
    server_port: int = Field(default=5556, ge=1, le=65535)
    log_level: str = "info"
    publish_max_asset_size: int = Field(
        default=1024 * 1024 * 1024,
        ge=1024 * 1024,
        le=10 * 1024 * 1024 * 1024,
    )
    publish_lease_seconds: int = Field(default=300, ge=60, le=1800)
    browser_task_lease_seconds: int = Field(default=120, ge=30, le=1800)
    managed_browser_executable: Path | None = None
    managed_browser_headless: bool = False
    managed_browser_startup_timeout: float = Field(default=15, gt=0, le=120)
    managed_browser_shutdown_timeout: float = Field(default=5, gt=0, le=30)

    @field_validator(
        "work_path",
        "proxy",
        "managed_browser_executable",
        mode="before",
    )
    @classmethod
    def empty_value_to_none(cls, value: Any) -> Any:
        """把 dotenv 中的空字符串转换为空值。

        Args:
            value: Pydantic 尚未转换的原始配置值。

        Returns:
            空字符串返回 ``None``，其他值保持不变。
        """
        return None if value == "" else value

    @field_validator("user_agent", mode="before")
    @classmethod
    def empty_user_agent_to_default(cls, value: Any) -> Any:
        """为空的 User-Agent 恢复安全默认值。

        Args:
            value: dotenv 或环境变量中的原始值。

        Returns:
            非空原值或默认浏览器标识。
        """
        return value or DEFAULT_USER_AGENT

    @field_validator("folder_name")
    @classmethod
    def validate_folder_name(cls, value: str) -> str:
        """确保媒体目录名称不能逃逸数据根目录。

        Args:
            value: 用户配置的目录名称。

        Returns:
            经过首尾空白清理的单段目录名称。

        Raises:
            ValueError: 名称为空或包含路径层级。
        """
        cleaned = value.strip()
        if not cleaned or Path(cleaned).name != cleaned or cleaned in {".", ".."}:
            raise ValueError("媒体目录必须是单段有效名称")
        return cleaned

    @field_validator("log_level")
    @classmethod
    def normalize_log_level(cls, value: str) -> str:
        """验证并规范化日志级别。

        Args:
            value: 用户配置的日志级别。

        Returns:
            适用于 Loguru 与服务器的标准小写级别。

        Raises:
            ValueError: 日志级别不受支持。
        """
        normalized = value.strip().lower()
        allowed = {
            "trace",
            "debug",
            "info",
            "warning",
            "error",
            "critical",
        }
        if normalized not in allowed:
            raise ValueError("日志级别必须是 trace/debug/info/warning/error/critical")
        return normalized

    @classmethod
    def from_env(
        cls,
        env_file: Path | None = None,
        **overrides: Any,
    ) -> "AppSettings":
        """从指定 dotenv 文件、进程环境和显式覆盖项创建配置。

        Args:
            env_file: dotenv 文件路径；为空时使用当前目录的 ``.env``。
            **overrides: 优先级最高的字段覆盖值。

        Returns:
            已验证的应用配置。
        """
        return cls(_env_file=env_file or Path(".env"), **overrides)

    @property
    def output_root(self) -> Path:
        """返回规范化后的数据根目录。

        Returns:
            绝对数据根目录。
        """
        root = self.work_path or Path.cwd().joinpath("volume")
        return root.expanduser().resolve()

    @property
    def download_dir(self) -> Path:
        """返回媒体文件目录。

        Returns:
            位于数据根目录下的媒体文件目录。
        """
        return self.output_root.joinpath(self.folder_name)

    @property
    def state_dir(self) -> Path:
        """返回应用状态目录。

        Returns:
            用于数据库和元数据的隐藏目录。
        """
        return self.output_root.joinpath(".xhs-downloader")

    @property
    def temp_dir(self) -> Path:
        """返回可恢复临时文件目录。

        Returns:
            保存断点续传文件的目录。
        """
        return self.state_dir.joinpath("partial")

    @property
    def publication_dir(self) -> Path:
        """返回发布素材目录。

        Returns:
            仅供本地服务和已登记扩展访问的素材目录。
        """
        return self.state_dir.joinpath("publication")

    @property
    def managed_browser_dir(self) -> Path:
        """返回受管浏览器状态目录。

        Returns:
            保存锁、运行状态和专用用户目录的本机路径。
        """
        return self.state_dir.joinpath("managed-browser")

    @property
    def managed_browser_profile_dir(self) -> Path:
        """返回默认受管浏览器用户目录。

        Returns:
            不与用户日常 Chrome 配置共享的持久化目录。
        """
        return self.managed_browser_dir.joinpath("profiles", "default")
