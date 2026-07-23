"""应用层依赖的可替换端口。"""

from contextlib import AbstractAsyncContextManager
from typing import Protocol

from httpx import Response

from .models import (
    ClientDownloadRecord,
    DownloadArtifact,
    DownloadRecord,
    WorkDetail,
)


class PageGateway(Protocol):
    """网页与媒体 HTTP 访问端口。"""

    async def resolve(self, url: str) -> str:
        """解析短链接。

        Args:
            url: 待解析链接。

        Returns:
            最终重定向地址。
        """
        ...

    async def get_text(self, url: str, cookie: str | None = None) -> str:
        """获取页面文本。

        Args:
            url: 页面地址。
            cookie: 可选的单次请求 Cookie。

        Returns:
            页面响应文本。
        """
        ...

    def stream(
        self,
        url: str,
        headers: dict[str, str] | None = None,
    ) -> AbstractAsyncContextManager[Response]:
        """打开媒体响应流。

        Args:
            url: 媒体地址。
            headers: 单次请求附加请求头。

        Returns:
            异步响应上下文管理器。
        """
        ...


class DetailParser(Protocol):
    """作品页面解析端口。"""

    def parse(self, html: str, source_url: str) -> WorkDetail:
        """把页面转换为领域模型。

        Args:
            html: 页面 HTML。
            source_url: 原始作品链接。

        Returns:
            经过验证的作品信息。
        """
        ...


class ArtifactDownloader(Protocol):
    """媒体文件下载端口。"""

    async def download(
        self,
        detail: WorkDetail,
        indexes: set[int] | None = None,
    ) -> list[DownloadArtifact]:
        """下载作品媒体。

        Args:
            detail: 作品信息。
            indexes: 仅下载指定的一基媒体序号。

        Returns:
            完整文件产物列表。
        """
        ...


class DownloadRepository(Protocol):
    """下载记录仓储端口。"""

    async def get(self, work_id: str) -> DownloadRecord | None:
        """读取作品下载记录。

        Args:
            work_id: 作品 ID。

        Returns:
            已有记录；不存在时返回 ``None``。
        """
        ...

    async def save(self, record: DownloadRecord) -> None:
        """原子保存作品下载记录。

        Args:
            record: 已完成文件校验的下载记录。
        """
        ...


class ClientRecordRepository(Protocol):
    """浏览器扩展下载记录仓储端口。"""

    async def save_many(self, records: list[ClientDownloadRecord]) -> int:
        """幂等保存一批客户端记录。

        Args:
            records: 扩展生成的下载记录。

        Returns:
            本次接收的记录数量。
        """
        ...

    async def list_recent(self, limit: int) -> list[ClientDownloadRecord]:
        """读取最近的客户端记录。

        Args:
            limit: 最大返回数量。

        Returns:
            按创建时间倒序排列的记录。
        """
        ...
