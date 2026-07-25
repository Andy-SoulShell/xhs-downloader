"""发布用例依赖的仓储与文件端口。"""

from collections.abc import AsyncIterable
from datetime import datetime
from pathlib import Path
from typing import Protocol

from .extension_presence import ExtensionPresence
from .publication import (
    PublicationAsset,
    PublicationDraft,
    PublicationTask,
    PublicationTaskStatus,
)


class PublicationDraftRepository(Protocol):
    """发布草稿仓储端口。"""

    async def save_draft(self, draft: PublicationDraft) -> None:
        """保存草稿。

        Args:
            draft: 完整草稿快照。
        """
        ...

    async def get_draft(self, draft_id: str) -> PublicationDraft | None:
        """读取草稿。

        Args:
            draft_id: 草稿唯一标识。

        Returns:
            草稿；不存在时返回 ``None``。
        """
        ...

    async def list_drafts(self, limit: int) -> list[PublicationDraft]:
        """列出最近草稿。

        Args:
            limit: 最大返回数量。

        Returns:
            按更新时间倒序排列的草稿。
        """
        ...

    async def delete_draft(self, draft_id: str) -> None:
        """删除草稿记录。

        Args:
            draft_id: 草稿唯一标识。
        """
        ...


class PublicationTaskRepository(Protocol):
    """发布任务与租约仓储端口。"""

    async def save_task(self, task: PublicationTask) -> None:
        """保存发布任务。

        Args:
            task: 完整任务快照。
        """
        ...

    async def get_task(self, task_id: str) -> PublicationTask | None:
        """读取发布任务。

        Args:
            task_id: 任务唯一标识。

        Returns:
            任务；不存在时返回 ``None``。
        """
        ...

    async def save_task_if_status(
        self,
        task: PublicationTask,
        expected: PublicationTaskStatus,
    ) -> bool:
        """按预期状态原子更新任务。

        Args:
            task: 新任务快照。
            expected: 数据库中必须匹配的旧状态。

        Returns:
            成功更新一条记录时返回真。
        """
        ...

    async def list_tasks(self, limit: int) -> list[PublicationTask]:
        """列出最近发布任务。

        Args:
            limit: 最大返回数量。

        Returns:
            按更新时间倒序排列的任务。
        """
        ...

    async def list_active_tasks(self) -> list[PublicationTask]:
        """读取所有尚未终结的任务。

        Returns:
            活跃任务列表。
        """
        ...

    async def claim_ready(
        self,
        extension_id: str,
        now: datetime,
        lease_expires_at: datetime,
        lease_hash: str,
        preferred_task_id: str | None,
    ) -> PublicationTask | None:
        """原子领取一个已就绪任务。

        Args:
            extension_id: 扩展实例标识。
            now: 领取时间。
            lease_expires_at: 租约到期时间。
            lease_hash: 不可逆的租约凭据摘要。
            preferred_task_id: 手动发布指定的任务。

        Returns:
            已领取任务；没有可执行任务时返回 ``None``。
        """
        ...

    async def validate_lease(self, task_id: str, lease_hash: str) -> bool:
        """校验任务租约。

        Args:
            task_id: 任务唯一标识。
            lease_hash: 请求携带凭据的摘要。

        Returns:
            凭据与任务当前租约一致时返回真。
        """
        ...

    async def clear_lease(self, task_id: str) -> None:
        """清除任务租约。

        Args:
            task_id: 任务唯一标识。
        """
        ...

    async def has_active_task(self, draft_id: str) -> bool:
        """判断草稿是否仍被活跃任务引用。

        Args:
            draft_id: 草稿唯一标识。

        Returns:
            存在活跃发布任务时返回真。
        """
        ...


class ExtensionCredentialRepository(Protocol):
    """扩展能力凭据仓储端口。"""

    async def register_extension(
        self,
        extension_id: str,
        token_hash: str,
        registered_at: datetime,
    ) -> None:
        """登记扩展能力凭据。

        Args:
            extension_id: 浏览器分配的扩展 ID。
            token_hash: 能力令牌摘要。
            registered_at: 登记时间。
        """
        ...

    async def validate_extension(
        self,
        extension_id: str,
        token_hash: str,
    ) -> bool:
        """校验扩展能力凭据。

        Args:
            extension_id: 浏览器分配的扩展 ID。
            token_hash: 能力令牌摘要。

        Returns:
            令牌与登记记录一致时返回真。
        """
        ...

    async def touch_extension(
        self,
        extension_id: str,
        seen_at: datetime,
    ) -> None:
        """记录扩展最近一次通过认证的时间。

        Args:
            extension_id: 浏览器分配的扩展 ID。
            seen_at: 本次认证成功时间。
        """
        ...

    async def list_extensions(self) -> list[ExtensionPresence]:
        """列出已经登记的扩展及其最近心跳。

        Returns:
            按最近心跳倒序排列的扩展状态。
        """
        ...


class PublicationAssetStore(Protocol):
    """发布素材文件存储端口。"""

    async def save(
        self,
        draft_id: str,
        asset_id: str,
        filename: str,
        media_type: str,
        content: AsyncIterable[bytes],
        max_size: int,
    ) -> PublicationAsset:
        """流式保存并校验一个素材。

        Args:
            draft_id: 草稿唯一标识。
            asset_id: 素材唯一标识。
            filename: 原始文件名。
            media_type: 浏览器报告的 MIME 类型。
            content: 异步字节流。
            max_size: 允许的最大字节数。

        Returns:
            已校验的素材元数据。
        """
        ...

    def path_for(self, draft_id: str, asset: PublicationAsset) -> Path:
        """返回素材的受控本地路径。

        Args:
            draft_id: 草稿唯一标识。
            asset: 已持久化素材。

        Returns:
            位于发布素材根目录内的绝对路径。
        """
        ...

    async def delete(self, draft_id: str, asset: PublicationAsset) -> None:
        """删除一个素材。

        Args:
            draft_id: 草稿唯一标识。
            asset: 待删除素材。
        """
        ...

    async def delete_draft(self, draft_id: str) -> None:
        """删除草稿的素材目录。

        Args:
            draft_id: 草稿唯一标识。
        """
        ...
