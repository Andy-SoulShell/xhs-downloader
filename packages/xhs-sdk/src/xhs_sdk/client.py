"""面向 Python 调用方的高层客户端。"""

from pathlib import Path
from typing import Any

from xhs_adapters import create_download_service
from xhs_adapters.config import AppSettings
from xhs_core.application import DownloadService


class XHS:
    """提供兼容旧入口的异步 Python 客户端。

    客户端隐藏依赖装配细节，适合脚本直接调用；Web 和 MCP 接口应使用各自的
    工厂函数。

    Args:
        env_file: dotenv 文件路径。
        **overrides: 配置覆盖项。
    """

    def __init__(self, env_file: Path | None = None, **overrides: Any) -> None:
        self.settings = AppSettings.from_env(env_file, **overrides)
        self._service: DownloadService | None = None

    async def __aenter__(self) -> "XHS":
        self._service = create_download_service(self.settings)
        await self._service.__aenter__()
        return self

    async def __aexit__(self, exc_type, exc_value, traceback) -> None:
        if self._service:
            await self._service.__aexit__(exc_type, exc_value, traceback)
            self._service = None

    async def detail(self, url: str) -> dict:
        """获取一个作品的结构化详情。

        Args:
            url: 小红书作品链接。

        Returns:
            使用中文字段名称的作品详情。

        Raises:
            RuntimeError: 客户端尚未进入异步上下文。
        """
        return (await self._require_service().get_detail(url)).public_dict()

    async def download(
        self,
        url: str,
        indexes: set[int] | None = None,
        force: bool = False,
    ) -> dict:
        """下载一个作品并返回结构化结果。

        Args:
            url: 小红书作品链接。
            indexes: 仅下载指定的一基图片序号。
            force: 是否强制重新下载。

        Returns:
            下载结果字典。

        Raises:
            RuntimeError: 客户端尚未进入异步上下文。
        """
        outcome = await self._require_service().download(url, indexes, force)
        return outcome.model_dump(mode="json", by_alias=True)

    def _require_service(self) -> DownloadService:
        if self._service is None:
            raise RuntimeError("请使用 async with XHS() 管理客户端生命周期")
        return self._service
