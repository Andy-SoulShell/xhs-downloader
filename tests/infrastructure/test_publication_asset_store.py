"""本地发布素材存储测试。"""

import pytest

from src.domain import PublicationError
from src.infrastructure import FilePublicationAssetStore


async def _chunks(*values: bytes):
    for value in values:
        yield value


async def test_asset_store_writes_validated_file_atomically(tmp_path) -> None:
    """确保素材按 MIME 后缀保存并可受控删除。

    Args:
        tmp_path: pytest 提供的临时目录。
    """
    store = FilePublicationAssetStore(tmp_path)
    asset = await store.save(
        "draft",
        "asset",
        "../unsafe.png",
        "image/jpeg",
        _chunks(b"synthetic-", b"media"),
        1024,
    )
    path = store.path_for("draft", asset)

    assert asset.filename == "unsafe.jpeg"
    assert asset.size == 15
    assert path.read_bytes() == b"synthetic-media"
    assert path.stat().st_mode & 0o777 == 0o600

    await store.delete("draft", asset)
    await store.delete_draft("draft")
    assert not path.exists()


@pytest.mark.parametrize(
    ("media_type", "content", "limit", "message"),
    [
        ("application/pdf", b"value", 100, "格式不受支持"),
        ("image/png", b"", 100, "不能为空"),
        ("video/mp4", b"too-large", 2, "超过大小上限"),
    ],
)
async def test_asset_store_rejects_invalid_input(
    tmp_path,
    media_type: str,
    content: bytes,
    limit: int,
    message: str,
) -> None:
    """确保不受支持、空文件和超限素材不会留下临时文件。

    Args:
        tmp_path: pytest 提供的临时目录。
        media_type: 合成 MIME 类型。
        content: 合成文件内容。
        limit: 大小上限。
        message: 预期错误片段。
    """
    store = FilePublicationAssetStore(tmp_path)

    with pytest.raises(PublicationError, match=message):
        await store.save(
            "draft",
            "asset",
            "synthetic.bin",
            media_type,
            _chunks(content),
            limit,
        )

    assert not list(tmp_path.rglob("*.part"))


async def test_asset_store_rejects_unsafe_identifiers_and_nonempty_folder(
    tmp_path,
) -> None:
    """确保路径标识不能逃逸根目录且未知文件不会被误删。

    Args:
        tmp_path: pytest 提供的临时目录。
    """
    store = FilePublicationAssetStore(tmp_path)
    with pytest.raises(PublicationError, match="草稿标识无效"):
        await store.save(
            "../escape",
            "asset",
            "synthetic.jpg",
            "image/jpeg",
            _chunks(b"value"),
            100,
        )
    directory = tmp_path.joinpath("draft")
    directory.mkdir()
    directory.joinpath("unknown").write_bytes(b"value")

    with pytest.raises(PublicationError, match="仍包含文件"):
        await store.delete_draft("draft")
