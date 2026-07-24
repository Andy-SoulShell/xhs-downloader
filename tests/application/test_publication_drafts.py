"""发布草稿用例测试。"""

import pytest
from xhs_adapters.filesystem import FilePublicationAssetStore
from xhs_adapters.sqlite import (
    SqlitePublicationDraftRepository,
    SqlitePublicationTaskRepository,
)
from xhs_core.application import PublicationDraftService
from xhs_core.domain import (
    PublicationError,
    PublicationMode,
    PublicationTask,
    PublicationTaskStatus,
)

from tests.helpers import make_publication_draft


async def _content(value: bytes):
    yield value


def _service(tmp_path, max_size: int = 1024) -> PublicationDraftService:
    database = tmp_path.joinpath("state.db")
    return PublicationDraftService(
        SqlitePublicationDraftRepository(database),
        SqlitePublicationTaskRepository(database),
        FilePublicationAssetStore(tmp_path.joinpath("publication")),
        max_size,
    )


async def test_draft_service_manages_content_assets_and_order(tmp_path) -> None:
    """确保草稿可以创建、上传素材、排序和删除。

    Args:
        tmp_path: pytest 提供的临时目录。
    """
    service = _service(tmp_path)
    draft = await service.create(" 标题 ", " 正文 ", ["#标签", "标签"])
    first = await service.add_asset(
        draft.draft_id,
        "first.png",
        "image/png",
        _content(b"first"),
    )
    second = await service.add_asset(
        draft.draft_id,
        "second.jpg",
        "image/jpeg",
        _content(b"second"),
    )
    reordered = await service.update(
        draft.draft_id,
        "新标题",
        "新正文",
        ["新标签"],
        [second.assets[1].asset_id, first.assets[0].asset_id],
    )

    assert draft.title == "标题"
    assert draft.tags == ["标签"]
    assert [item.filename for item in reordered.assets] == [
        "second.jpeg",
        "first.png",
    ]
    assert [item.position for item in reordered.assets] == [0, 1]

    remaining = await service.remove_asset(
        draft.draft_id,
        reordered.assets[0].asset_id,
    )
    assert len(remaining.assets) == 1
    assert (await service.require(draft.draft_id)).title == "新标题"
    await service.delete(draft.draft_id)
    assert await service.list_recent(10) == []


async def test_draft_service_rejects_invalid_operations(tmp_path) -> None:
    """确保缺失草稿、不完整排序和超限素材返回清晰错误。

    Args:
        tmp_path: pytest 提供的临时目录。
    """
    service = _service(tmp_path, max_size=4)
    draft = await service.create("", "", [])
    with pytest.raises(PublicationError, match="不存在"):
        await service.require("missing")
    with pytest.raises(PublicationError, match="大小上限"):
        await service.add_asset(
            draft.draft_id,
            "large.png",
            "image/png",
            _content(b"large"),
        )
    with pytest.raises(PublicationError, match="顺序必须完整"):
        await service.update(draft.draft_id, "", "", [], ["missing"])


async def test_draft_service_rejects_mixed_or_multiple_video_assets(
    tmp_path,
) -> None:
    """确保创作平台不支持的图文视频混合包不会进入任务。

    Args:
        tmp_path: pytest 提供的临时目录。
    """
    service = _service(tmp_path)
    images = await service.create("图文", "正文", [])
    images = await service.add_asset(
        images.draft_id,
        "image.png",
        "image/png",
        _content(b"image"),
    )
    with pytest.raises(PublicationError, match="一个视频"):
        await service.add_asset(
            images.draft_id,
            "video.mp4",
            "video/mp4",
            _content(b"video"),
        )

    video = await service.create("视频", "正文", [])
    video = await service.add_asset(
        video.draft_id,
        "video.mp4",
        "video/mp4",
        _content(b"video"),
    )
    with pytest.raises(PublicationError, match="不能混合"):
        await service.add_asset(
            video.draft_id,
            "image.png",
            "image/png",
            _content(b"image"),
        )


async def test_draft_service_protects_assets_used_by_active_task(tmp_path) -> None:
    """确保活跃发布任务引用的素材和草稿不能被删除。

    Args:
        tmp_path: pytest 提供的临时目录。
    """
    database = tmp_path.joinpath("state.db")
    task_repository = SqlitePublicationTaskRepository(database)
    service = PublicationDraftService(
        SqlitePublicationDraftRepository(database),
        task_repository,
        FilePublicationAssetStore(tmp_path.joinpath("publication")),
        1024,
    )
    draft = await service.create("标题", "正文", [])
    draft = await service.add_asset(
        draft.draft_id,
        "asset.jpg",
        "image/jpeg",
        _content(b"asset"),
    )
    template = make_publication_draft(draft.draft_id)
    task = PublicationTask(
        task_id="active",
        package=draft,
        package_fingerprint=draft.fingerprint(),
        mode=PublicationMode.MANUAL,
        status=PublicationTaskStatus.READY,
        scheduled_at=template.updated_at,
        created_at=template.created_at,
        updated_at=template.updated_at,
    )
    await task_repository.save_task(task)

    with pytest.raises(PublicationError, match="不能删除素材"):
        await service.remove_asset(draft.draft_id, draft.assets[0].asset_id)
    with pytest.raises(PublicationError, match="不能删除"):
        await service.delete(draft.draft_id)
