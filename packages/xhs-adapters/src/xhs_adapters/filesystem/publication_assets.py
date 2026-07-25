"""本地发布素材文件存储。"""

import asyncio
import os
import re
from collections.abc import AsyncIterable
from contextlib import suppress
from hashlib import sha256
from pathlib import Path

import aiofiles
from xhs_core.domain import PublicationAsset, PublicationError

from ..file_security import restrict_file_to_current_user

_SAFE_ID = re.compile(r"^[A-Za-z0-9_-]{1,128}$")
_MIME_SUFFIX = {
    "image/jpeg": ".jpeg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/heic": ".heic",
    "image/avif": ".avif",
    "video/mp4": ".mp4",
    "video/quicktime": ".mov",
    "video/webm": ".webm",
}


class FilePublicationAssetStore:
    """在受控目录内原子保存发布素材。

    Args:
        root: 发布素材根目录。
    """

    def __init__(self, root: Path) -> None:
        self._root = root.expanduser().resolve()

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

        Raises:
            PublicationError: 标识、类型、大小或文件内容无效。
        """
        self._validate_id(draft_id, "草稿")
        self._validate_id(asset_id, "素材")
        if media_type not in _MIME_SUFFIX:
            raise PublicationError("发布素材格式不受支持")
        safe_name = self._safe_filename(filename, media_type)
        directory = self._root.joinpath(draft_id)
        directory.mkdir(parents=True, exist_ok=True)
        target = directory.joinpath(f"{asset_id}{Path(safe_name).suffix.lower()}")
        temporary = directory.joinpath(f".{asset_id}.part")
        digest = sha256()
        size = 0
        try:
            async with aiofiles.open(temporary, "wb") as stream:
                async for chunk in content:
                    if not chunk:
                        continue
                    size += len(chunk)
                    if size > max_size:
                        raise PublicationError(f"素材超过大小上限 {max_size} 字节")
                    digest.update(chunk)
                    await stream.write(chunk)
                await stream.flush()
                await asyncio.to_thread(os.fsync, stream.fileno())
            if size == 0:
                raise PublicationError("发布素材不能为空")
            restrict_file_to_current_user(temporary)
            os.replace(temporary, target)
        except OSError as error:
            raise PublicationError(f"发布素材写入失败：{error}") from error
        finally:
            with suppress(OSError):
                temporary.unlink(missing_ok=True)
        return PublicationAsset(
            asset_id=asset_id,
            filename=safe_name,
            media_type=media_type,
            size=size,
            sha256=digest.hexdigest(),
            position=0,
        )

    def path_for(self, draft_id: str, asset: PublicationAsset) -> Path:
        """返回素材的受控本地路径。

        Args:
            draft_id: 草稿唯一标识。
            asset: 已持久化素材。

        Returns:
            位于发布素材根目录内的绝对路径。

        Raises:
            PublicationError: 标识或素材路径无效。
        """
        self._validate_id(draft_id, "草稿")
        self._validate_id(asset.asset_id, "素材")
        suffix = Path(asset.filename).suffix.lower()
        path = self._root.joinpath(draft_id, f"{asset.asset_id}{suffix}").resolve()
        if not path.is_relative_to(self._root):
            raise PublicationError("发布素材路径无效")
        return path

    async def delete(self, draft_id: str, asset: PublicationAsset) -> None:
        """删除一个素材。

        Args:
            draft_id: 草稿唯一标识。
            asset: 待删除素材。
        """
        path = self.path_for(draft_id, asset)
        await asyncio.to_thread(path.unlink, missing_ok=True)

    async def delete_draft(self, draft_id: str) -> None:
        """删除空的草稿素材目录。

        Args:
            draft_id: 草稿唯一标识。

        Raises:
            PublicationError: 目录仍含未知文件。
        """
        self._validate_id(draft_id, "草稿")
        directory = self._root.joinpath(draft_id)
        if not directory.exists():
            return
        if any(directory.iterdir()):
            raise PublicationError("草稿素材目录仍包含文件")
        await asyncio.to_thread(directory.rmdir)

    @staticmethod
    def _validate_id(value: str, label: str) -> None:
        if not _SAFE_ID.fullmatch(value):
            raise PublicationError(f"{label}标识无效")

    @staticmethod
    def _safe_filename(filename: str, media_type: str) -> str:
        name = Path(filename).name.strip()
        suffix = _MIME_SUFFIX[media_type]
        stem = Path(name).stem.strip()[:180] or "media"
        stem = re.sub(r"[\x00-\x1f/:*?\"<>|]+", "_", stem)
        return f"{stem}{suffix}"
