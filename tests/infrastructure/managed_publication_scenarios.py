"""构造完全合成的受管发布任务与页面响应。"""

from datetime import UTC, datetime
from hashlib import sha256
from pathlib import Path
from typing import Literal

from xhs_adapters.managed_publication_contract import (
    PUBLISH_SELECTOR,
    UPLOAD_SELECTOR,
)
from xhs_core.domain import (
    BrowserDriver,
    PublicationAsset,
    PublicationDraft,
    PublicationMode,
    PublicationTask,
    PublicationTaskStatus,
    PublicationVisibility,
)

SYNTHETIC_TIME = datetime(2026, 7, 25, 12, 34, tzinfo=UTC)
PENDING_RESPONSE: dict[str, object] = {
    "ok": True,
    "state": "pending",
    "message": "等待创作平台确认",
}
PUBLISHED_RESPONSE: dict[str, object] = {
    "ok": True,
    "state": "published",
    "message": "创作平台已确认发布成功",
    "resultUrl": "https://www.xiaohongshu.com/explore/abcdef123456",
}


def native_publication_responses(
    media_kind: Literal["image", "video"],
    *,
    observe: list[dict[str, object]],
) -> dict[str, list[dict[str, object]]]:
    """构造原生发布按钮的固定页面协议响应。

    Args:
        media_kind: 图片或视频发布模式。
        observe: 点击前后依次返回的观察结果。

    Returns:
        可交给合成页面执行的响应脚本。
    """
    return {
        "upload": [
            {
                "ok": True,
                "message": "创作页素材入口已准备",
                "action": "upload",
                "mediaKind": media_kind,
                "selector": UPLOAD_SELECTOR,
            }
        ],
        "fill": [{"ok": True, "message": "创作页内容和发布选项已核验"}],
        "prepare_publish": [
            {
                "ok": True,
                "message": "原生发布按钮已核验",
                "action": "click_selector",
                "selector": PUBLISH_SELECTOR,
            }
        ],
        "observe": observe,
    }


def synthetic_publication_task(
    tmp_path: Path,
    media_kind: Literal["image", "video"],
    *,
    asset_count: int = 1,
    mode: PublicationMode = PublicationMode.MANUAL,
    original: bool = False,
) -> tuple[PublicationTask, tuple[Path, ...]]:
    """创建带本地合成素材的受管发布任务。

    Args:
        tmp_path: Pytest 提供的临时素材目录。
        media_kind: 图片或视频发布模式。
        asset_count: 合成素材数量。
        mode: 立即、本地定时或官方定时模式。
        original: 是否开启图文原创声明。

    Returns:
        已进入填充阶段的任务及按位置排序的绝对素材路径。
    """
    suffix = ".jpg" if media_kind == "image" else ".mp4"
    contents = [f"synthetic-{index}".encode() for index in range(asset_count)]
    assets = [
        PublicationAsset(
            asset_id=f"asset-{index}",
            filename=f"synthetic-{index}{suffix}",
            media_type=f"{media_kind}/synthetic",
            size=len(contents[index]),
            sha256=sha256(contents[index]).hexdigest(),
            position=index,
        )
        for index in range(asset_count)
    ]
    paths = tuple(tmp_path.joinpath(f"{asset.asset_id}{suffix}") for asset in assets)
    for path, content in zip(paths, contents, strict=True):
        path.write_bytes(content)
    draft = PublicationDraft(
        draft_id="synthetic-draft",
        title="合成标题",
        body="合成正文",
        tags=["合成标签"],
        visibility=PublicationVisibility.PRIVATE,
        is_original=original,
        assets=assets,
        created_at=SYNTHETIC_TIME,
        updated_at=SYNTHETIC_TIME,
    )
    task = PublicationTask(
        task_id="synthetic-task",
        package=draft,
        package_fingerprint=draft.fingerprint(),
        mode=mode,
        target_driver=BrowserDriver.MANAGED,
        status=PublicationTaskStatus.FILLING,
        scheduled_at=SYNTHETIC_TIME,
        attempts=1,
        created_at=SYNTHETIC_TIME,
        updated_at=SYNTHETIC_TIME,
    )
    return task, paths
