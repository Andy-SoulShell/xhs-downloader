"""复核受管发布素材路径与冻结内容。"""

import asyncio
from collections.abc import Sequence
from hashlib import sha256
from pathlib import Path

from xhs_core.domain import ManagedBrowserError, PublicationAsset, PublicationTask


def validate_publication_asset_paths(
    task: PublicationTask,
    asset_paths: Sequence[Path],
) -> tuple[Path, ...]:
    """按冻结发布包复核素材路径、文件名和顺序。

    Args:
        task: 包含冻结素材元数据的发布任务。
        asset_paths: Worker 提供的绝对素材路径。

    Returns:
        与素材位置顺序一致的不可变路径元组。

    Raises:
        ManagedBrowserError: 路径数量、顺序、名称或文件类型无效。
    """
    paths = tuple(asset_paths)
    ordered = sorted(task.package.assets, key=lambda item: item.position)
    unique_positions = {item.position for item in ordered}
    if len(paths) != len(ordered) or len(unique_positions) != len(ordered):
        raise ManagedBrowserError("受管发布素材顺序无效")
    for asset, path in zip(ordered, paths, strict=True):
        expected_name = f"{asset.asset_id}{Path(asset.filename).suffix.lower()}"
        if not path.is_absolute() or not path.is_file() or path.name != expected_name:
            raise ManagedBrowserError("受管发布素材路径无效")
    if len(set(paths)) != len(paths):
        raise ManagedBrowserError("受管发布素材路径重复")
    return paths


async def verify_publication_asset_contents(
    task: PublicationTask,
    paths: tuple[Path, ...],
) -> None:
    """紧邻浏览器上传前重新核验素材大小与 SHA-256。

    Args:
        task: 包含冻结素材摘要的发布任务。
        paths: 已按素材位置排序的本地路径。

    Raises:
        ManagedBrowserError: 任一素材已经丢失或内容发生变化。
    """
    ordered = tuple(sorted(task.package.assets, key=lambda item: item.position))
    matches = await asyncio.to_thread(_all_assets_match, ordered, paths)
    if not matches:
        raise ManagedBrowserError("受管发布素材内容已经变化")


def _all_assets_match(
    assets: tuple[PublicationAsset, ...],
    paths: tuple[Path, ...],
) -> bool:
    try:
        return all(
            _asset_matches(asset, path)
            for asset, path in zip(assets, paths, strict=True)
        )
    except (OSError, ValueError):
        return False


def _asset_matches(asset: PublicationAsset, path: Path) -> bool:
    if path.stat().st_size != asset.size:
        return False
    digest = sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest() == asset.sha256
