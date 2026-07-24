"""采集帖子应用用例。"""

from xhs_core.domain.models import DownloadOutcome, WorkDetail
from xhs_core.domain.ports import PostRepository

from .download import DownloadService


class CollectionService:
    """编排详情解析、下载与帖子库持久化。

    Args:
        downloads: 下载应用服务。
        posts: 采集帖子仓储。
    """

    def __init__(self, downloads: DownloadService, posts: PostRepository) -> None:
        self._downloads = downloads
        self._posts = posts

    async def collect(
        self,
        text: str,
        cookie: str | None = None,
    ) -> WorkDetail:
        """解析并保存一个帖子。

        Args:
            text: 作品链接或包含链接的文本。
            cookie: 可选单次请求 Cookie。

        Returns:
            已保存的帖子详情。
        """
        detail = await self._downloads.get_detail(text, cookie)
        await self._posts.save(detail)
        return detail

    async def download(
        self,
        text: str,
        indexes: set[int] | None = None,
        force: bool = False,
        cookie: str | None = None,
    ) -> DownloadOutcome:
        """下载并保存帖子详情。

        Args:
            text: 作品链接或包含链接的文本。
            indexes: 仅下载指定媒体序号。
            force: 是否强制重新下载。
            cookie: 可选单次请求 Cookie。

        Returns:
            下载结果。
        """
        outcome = await self._downloads.download(text, indexes, force, cookie)
        await self._posts.save(outcome.detail)
        return outcome

    async def list_recent(self, limit: int) -> list[WorkDetail]:
        """读取帖子库。

        Args:
            limit: 最大返回数量。

        Returns:
            按采集时间倒序排列的帖子。
        """
        return await self._posts.list_recent(limit)

    async def delete(self, work_id: str) -> None:
        """删除帖子库记录。

        Args:
            work_id: 作品 ID。
        """
        await self._posts.delete(work_id)
