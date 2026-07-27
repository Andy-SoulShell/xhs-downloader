"""应用层依赖的可替换端口。"""

from collections.abc import AsyncIterator, Callable, Mapping
from contextlib import AbstractAsyncContextManager
from pathlib import Path
from typing import Protocol

from .models import (
    ClientDownloadRecord,
    DownloadArtifact,
    DownloadProgress,
    DownloadRecord,
    DownloadTask,
    DownloadTaskStatus,
    WorkDetail,
)


class DownloadSettings(Protocol):
    """下载应用服务所需的最小配置边界。"""

    mapping_data: dict[str, str]
    download_record: bool
    record_data: bool

    @property
    def output_root(self) -> Path:
        """返回数据根目录。

        Returns:
            下载产物的数据根目录。
        """
        ...

    @property
    def state_dir(self) -> Path:
        """返回状态目录。

        Returns:
            可恢复状态文件的存储目录。
        """
        ...


class StreamResponse(Protocol):
    """媒体下载需要的流式响应边界。"""

    headers: Mapping[str, str]
    status_code: int

    def aiter_bytes(self, chunk_size: int | None = None) -> AsyncIterator[bytes]:
        """按块读取响应体。

        Args:
            chunk_size: 每次读取的字节数；为空时使用响应默认值。

        Returns:
            异步字节块迭代器。
        """
        ...


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
    ) -> AbstractAsyncContextManager[StreamResponse]:
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
        on_progress: Callable[[DownloadProgress], None] | None = None,
    ) -> list[DownloadArtifact]:
        """下载作品媒体。

        Args:
            detail: 作品信息。
            indexes: 仅下载指定的一基媒体序号。
            on_progress: 进度回调；为空表示调用方不关心进度。

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


class PostRepository(Protocol):
    """采集帖子仓储端口。"""

    async def save(self, detail: WorkDetail) -> None:
        """保存帖子详情。

        Args:
            detail: 已验证的帖子详情。
        """
        ...

    async def list_recent(self, limit: int) -> list[WorkDetail]:
        """读取最近采集的帖子。

        Args:
            limit: 最大返回数量。

        Returns:
            按采集时间倒序排列的帖子。
        """
        ...

    async def delete(self, work_id: str) -> None:
        """删除采集帖子。

        Args:
            work_id: 作品 ID。
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


class TaskRepository(Protocol):
    """后台下载任务仓储端口。"""

    async def get(self, task_id: str) -> DownloadTask | None:
        """按任务 ID 读取记录。

        Args:
            task_id: 任务唯一标识。

        Returns:
            已有任务；不存在时返回 ``None``。
        """
        ...

    async def get_by_request_id(self, request_id: str) -> DownloadTask | None:
        """按客户端幂等标识读取任务。

        Args:
            request_id: 客户端请求标识。

        Returns:
            已有任务；不存在时返回 ``None``。
        """
        ...

    async def save(self, task: DownloadTask) -> None:
        """新增或覆盖任务状态。

        Args:
            task: 完整任务快照。
        """
        ...

    async def list_recent(
        self,
        limit: int,
        status: DownloadTaskStatus | None = None,
    ) -> list[DownloadTask]:
        """读取最近任务。

        Args:
            limit: 最大返回数量。
            status: 可选状态筛选。

        Returns:
            按更新时间倒序排列的任务。
        """
        ...

    async def list_recoverable(self) -> list[DownloadTask]:
        """读取服务重启后需要恢复的任务。

        Returns:
            排队中或执行中的任务。
        """
        ...
