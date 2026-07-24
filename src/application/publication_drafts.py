"""发布草稿与素材管理用例。"""

from collections.abc import AsyncIterable
from datetime import UTC, datetime
from uuid import uuid4

from src.domain import PublicationDraft, PublicationError
from src.domain.publication_ports import (
    PublicationAssetStore,
    PublicationDraftRepository,
    PublicationTaskRepository,
)


class PublicationDraftService:
    """管理草稿内容与受控素材文件。

    Args:
        drafts: 草稿仓储。
        tasks: 用于保护活跃任务素材的任务仓储。
        assets: 素材文件存储。
        max_asset_size: 单个素材允许的最大字节数。
    """

    def __init__(
        self,
        drafts: PublicationDraftRepository,
        tasks: PublicationTaskRepository,
        assets: PublicationAssetStore,
        max_asset_size: int,
    ) -> None:
        self._drafts = drafts
        self._tasks = tasks
        self._assets = assets
        self._max_asset_size = max_asset_size

    async def create(
        self,
        title: str,
        body: str,
        tags: list[str],
    ) -> PublicationDraft:
        """创建草稿。

        Args:
            title: 发布标题。
            body: 发布正文。
            tags: 不含井号的标签。

        Returns:
            新建草稿。
        """
        now = datetime.now(UTC)
        draft = PublicationDraft(
            draft_id=uuid4().hex,
            title=title.strip(),
            body=body.strip(),
            tags=tags,
            created_at=now,
            updated_at=now,
        )
        await self._drafts.save_draft(draft)
        return draft

    async def update(
        self,
        draft_id: str,
        title: str,
        body: str,
        tags: list[str],
        asset_order: list[str] | None = None,
    ) -> PublicationDraft:
        """更新草稿及素材顺序。

        Args:
            draft_id: 草稿唯一标识。
            title: 发布标题。
            body: 发布正文。
            tags: 不含井号的标签。
            asset_order: 可选的完整素材 ID 顺序。

        Returns:
            更新后的草稿。

        Raises:
            PublicationError: 草稿不存在或素材顺序不完整。
        """
        draft = await self.require(draft_id)
        assets = draft.assets
        if asset_order is not None:
            current = {asset.asset_id: asset for asset in assets}
            if len(asset_order) != len(current) or set(asset_order) != set(current):
                raise PublicationError("素材顺序必须完整且不能重复")
            assets = [
                current[asset_id].model_copy(update={"position": position})
                for position, asset_id in enumerate(asset_order)
            ]
        updated = draft.model_copy(
            update={
                "title": title.strip(),
                "body": body.strip(),
                "tags": tags,
                "assets": assets,
                "updated_at": datetime.now(UTC),
            }
        )
        updated = PublicationDraft.model_validate(updated.model_dump())
        await self._drafts.save_draft(updated)
        return updated

    async def add_asset(
        self,
        draft_id: str,
        filename: str,
        media_type: str,
        content: AsyncIterable[bytes],
    ) -> PublicationDraft:
        """上传并附加一个素材。

        Args:
            draft_id: 草稿唯一标识。
            filename: 原始文件名。
            media_type: 浏览器报告的 MIME 类型。
            content: 异步字节流。

        Returns:
            包含新素材的草稿。

        Raises:
            PublicationError: 草稿不存在或素材数量已达上限。
        """
        draft = await self.require(draft_id)
        _validate_new_asset(draft, media_type)
        asset = await self._assets.save(
            draft_id,
            uuid4().hex,
            filename,
            media_type,
            content,
            self._max_asset_size,
        )
        asset = asset.model_copy(update={"position": len(draft.assets)})
        updated = draft.model_copy(
            update={
                "assets": [*draft.assets, asset],
                "updated_at": datetime.now(UTC),
            }
        )
        try:
            await self._drafts.save_draft(updated)
        except Exception:
            await self._assets.delete(draft_id, asset)
            raise
        return updated

    async def remove_asset(
        self,
        draft_id: str,
        asset_id: str,
    ) -> PublicationDraft:
        """删除未被活跃任务引用的素材。

        Args:
            draft_id: 草稿唯一标识。
            asset_id: 素材唯一标识。

        Returns:
            删除素材后的草稿。

        Raises:
            PublicationError: 草稿、素材不存在或存在活跃任务。
        """
        draft = await self.require(draft_id)
        if await self._tasks.has_active_task(draft_id):
            raise PublicationError("草稿存在活跃发布任务，不能删除素材")
        asset = next(
            (item for item in draft.assets if item.asset_id == asset_id),
            None,
        )
        if not asset:
            raise PublicationError("发布素材不存在")
        assets = [
            item.model_copy(update={"position": position})
            for position, item in enumerate(
                item for item in draft.assets if item.asset_id != asset_id
            )
        ]
        updated = draft.model_copy(
            update={"assets": assets, "updated_at": datetime.now(UTC)}
        )
        await self._drafts.save_draft(updated)
        await self._assets.delete(draft_id, asset)
        return updated

    async def delete(self, draft_id: str) -> None:
        """删除没有活跃任务的草稿和素材。

        Args:
            draft_id: 草稿唯一标识。

        Raises:
            PublicationError: 草稿存在活跃任务。
        """
        draft = await self.require(draft_id)
        if await self._tasks.has_active_task(draft_id):
            raise PublicationError("草稿存在活跃发布任务，不能删除")
        for asset in draft.assets:
            await self._assets.delete(draft_id, asset)
        await self._assets.delete_draft(draft_id)
        await self._drafts.delete_draft(draft_id)

    async def require(self, draft_id: str) -> PublicationDraft:
        """读取草稿，不存在时抛出领域错误。

        Args:
            draft_id: 草稿唯一标识。

        Returns:
            已存在草稿。

        Raises:
            PublicationError: 草稿不存在。
        """
        draft = await self._drafts.get_draft(draft_id)
        if not draft:
            raise PublicationError("发布草稿不存在")
        return draft

    async def list_recent(self, limit: int) -> list[PublicationDraft]:
        """列出最近草稿。

        Args:
            limit: 最大返回数量。

        Returns:
            按更新时间倒序排列的草稿。
        """
        return await self._drafts.list_drafts(limit)


def _validate_new_asset(draft: PublicationDraft, media_type: str) -> None:
    incoming_video = media_type.startswith("video/")
    existing_video = any(
        asset.media_type.startswith("video/") for asset in draft.assets
    )
    if incoming_video and draft.assets:
        raise PublicationError("视频笔记只能包含一个视频素材")
    if not incoming_video and existing_video:
        raise PublicationError("图文与视频素材不能混合发布")
    if not incoming_video and len(draft.assets) >= 18:
        raise PublicationError("图文笔记最多包含 18 张图片")
