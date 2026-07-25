"""受管发布任务冻结驱动与能力边界测试。"""

from datetime import UTC, datetime, timedelta

import pytest
from xhs_adapters.filesystem import FilePublicationAssetStore
from xhs_adapters.sqlite import SqlitePublicationTaskRepository
from xhs_core.application import (
    PublicationExecutionService,
    PublicationScheduler,
    PublicationTaskService,
)
from xhs_core.domain import (
    BrowserDriver,
    PublicationError,
    PublicationMode,
    PublicationVisibility,
)

from tests.helpers import make_publication_draft


def _services(tmp_path):
    repository = SqlitePublicationTaskRepository(tmp_path.joinpath("state.db"))
    scheduler = PublicationScheduler(repository)
    tasks = PublicationTaskService(repository, scheduler)
    execution = PublicationExecutionService(
        repository,
        FilePublicationAssetStore(tmp_path.joinpath("publication")),
        scheduler,
        lease_seconds=60,
    )
    return tasks, execution


async def test_submit_freezes_driver_and_deduplicates_per_driver(tmp_path) -> None:
    """确保同一发布包按提交瞬间驱动分别生成不可变任务。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    tasks, _ = _services(tmp_path)
    draft = make_publication_draft().model_copy(
        update={"visibility": PublicationVisibility.PRIVATE}
    )

    extension = await tasks.submit(draft, PublicationMode.MANUAL, None)
    managed = await tasks.submit(
        draft,
        PublicationMode.MANUAL,
        None,
        BrowserDriver.MANAGED,
    )
    repeated = await tasks.submit(
        draft,
        PublicationMode.MANUAL,
        None,
        BrowserDriver.MANAGED,
    )

    assert extension.target_driver is BrowserDriver.EXTENSION
    assert managed.target_driver is BrowserDriver.MANAGED
    assert managed.task_id != extension.task_id
    assert repeated.task_id == managed.task_id


async def test_managed_submit_accepts_video_and_platform_schedule(tmp_path) -> None:
    """确保受管任务覆盖单视频、图片原创和平台官方定时模式。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    tasks, _ = _services(tmp_path)
    draft = make_publication_draft()
    video = draft.assets[0].model_copy(
        update={
            "filename": "synthetic.mp4",
            "media_type": "video/mp4",
        }
    )
    private_video = draft.model_copy(
        update={
            "visibility": PublicationVisibility.PRIVATE,
            "assets": [video],
        }
    )

    immediate = await tasks.submit(
        private_video,
        PublicationMode.MANUAL,
        None,
        BrowserDriver.MANAGED,
    )
    scheduled = await tasks.submit(
        private_video,
        PublicationMode.PLATFORM_SCHEDULED,
        datetime.now(UTC) + timedelta(hours=2),
        BrowserDriver.MANAGED,
    )
    original_image = draft.model_copy(
        update={
            "visibility": PublicationVisibility.PRIVATE,
            "is_original": True,
        }
    )
    original = await tasks.submit(
        original_image,
        PublicationMode.MANUAL,
        None,
        BrowserDriver.MANAGED,
    )

    assert immediate.package.assets[0].media_type == "video/mp4"
    assert scheduled.mode is PublicationMode.PLATFORM_SCHEDULED
    assert scheduled.target_driver is BrowserDriver.MANAGED
    assert original.package.is_original is True


@pytest.mark.parametrize(
    ("updates", "message"),
    [
        ({"visibility": PublicationVisibility.PUBLIC}, "仅自己可见"),
        ({"products": ["合成商品"]}, "绑定商品"),
    ],
)
async def test_managed_submit_rejects_options_outside_first_batch(
    tmp_path,
    updates: dict[str, object],
    message: str,
) -> None:
    """确保受管首批任务在提交边界拒绝尚未支持的选项。

    Args:
        tmp_path: Pytest 提供的临时目录。
        updates: 合成草稿字段改动。
        message: 预期的用户错误片段。
    """
    tasks, _ = _services(tmp_path)
    draft = make_publication_draft().model_copy(
        update={
            "visibility": PublicationVisibility.PRIVATE,
            **updates,
        }
    )

    with pytest.raises(PublicationError, match=message):
        await tasks.submit(
            draft,
            PublicationMode.MANUAL,
            None,
            BrowserDriver.MANAGED,
        )


async def test_extension_and_managed_claims_are_strictly_isolated(tmp_path) -> None:
    """确保扩展无法领取受管任务，受管 Worker 也不抢扩展任务。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    tasks, execution = _services(tmp_path)
    draft = make_publication_draft().model_copy(
        update={"visibility": PublicationVisibility.PRIVATE}
    )
    extension = await tasks.submit(draft, PublicationMode.MANUAL, None)
    managed = await tasks.submit(
        draft,
        PublicationMode.MANUAL,
        None,
        BrowserDriver.MANAGED,
    )

    assert await execution.claim("extension", managed.task_id) is None
    managed_claim = await execution.claim(
        "managed-worker",
        target_driver=BrowserDriver.MANAGED,
    )
    extension_claim = await execution.claim("extension", extension.task_id)

    assert managed_claim is not None
    assert managed_claim.task.task_id == managed.task_id
    assert managed_claim.task.executor_id == "managed-worker"
    assert managed_claim.task.extension_id is None
    assert extension_claim is not None
    assert extension_claim.task.task_id == extension.task_id
    assert extension_claim.task.extension_id == "extension"
