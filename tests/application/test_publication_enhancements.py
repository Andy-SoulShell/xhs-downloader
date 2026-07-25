"""发布增强参数、官方定时与人工核对测试。"""

from datetime import UTC, datetime, timedelta

import pytest
from xhs_adapters.sqlite import SqlitePublicationTaskRepository
from xhs_core.application import PublicationScheduler, PublicationTaskService
from xhs_core.domain import (
    PublicationDraft,
    PublicationError,
    PublicationMode,
    PublicationTaskStatus,
    PublicationVisibility,
)

from tests.helpers import make_publication_draft


def test_publication_options_are_normalized_and_fingerprinted() -> None:
    """确保可见范围、原创和商品进入冻结内容指纹。"""
    base = make_publication_draft()
    enhanced = PublicationDraft.model_validate(
        base.model_copy(
            update={
                "visibility": PublicationVisibility.MUTUAL,
                "is_original": True,
                "products": [" 合成商品 ", "合成商品", "商品-2"],
            }
        ).model_dump()
    )

    assert enhanced.products == ["合成商品", "商品-2"]
    assert enhanced.visibility is PublicationVisibility.MUTUAL
    assert enhanced.fingerprint() != base.fingerprint()


async def test_platform_schedule_is_distinct_and_bounded(tmp_path) -> None:
    """确保官方定时立即交给扩展，并限制在平台允许的时间窗口。

    Args:
        tmp_path: pytest 提供的临时目录。
    """
    repository = SqlitePublicationTaskRepository(tmp_path.joinpath("state.db"))
    scheduler = PublicationScheduler(repository)
    service = PublicationTaskService(repository, scheduler)
    now = datetime.now(UTC)

    task = await service.submit(
        make_publication_draft(),
        PublicationMode.PLATFORM_SCHEDULED,
        now + timedelta(hours=2),
    )

    assert task.status is PublicationTaskStatus.READY
    assert task.message == "等待扩展设置官方定时发布"
    with pytest.raises(PublicationError, match="至少在 1 小时后"):
        await service.submit(
            make_publication_draft("too-soon"),
            PublicationMode.PLATFORM_SCHEDULED,
            now + timedelta(minutes=30),
        )
    with pytest.raises(PublicationError, match="不能超过 14 天"):
        await service.submit(
            make_publication_draft("too-late"),
            PublicationMode.PLATFORM_SCHEDULED,
            now + timedelta(days=15),
        )


async def test_uncertain_publication_requires_review_before_retry(tmp_path) -> None:
    """确保不确定发布必须先人工定性，不能直接重新执行。

    Args:
        tmp_path: pytest 提供的临时目录。
    """
    repository = SqlitePublicationTaskRepository(tmp_path.joinpath("state.db"))
    service = PublicationTaskService(
        repository,
        PublicationScheduler(repository),
    )
    task = await service.submit(
        make_publication_draft(),
        PublicationMode.MANUAL,
        None,
    )
    uncertain = task.model_copy(update={"status": PublicationTaskStatus.NEEDS_REVIEW})
    await repository.save_task(uncertain)

    with pytest.raises(PublicationError, match="必须先人工核对"):
        await service.retry(task.task_id)
    reviewed = await service.review(task.task_id, False)
    assert reviewed.status is PublicationTaskStatus.FAILED
    assert (await service.retry(task.task_id)).status is PublicationTaskStatus.READY

    second = await service.submit(
        make_publication_draft("published-draft"),
        PublicationMode.MANUAL,
        None,
    )
    await repository.save_task(
        second.model_copy(update={"status": PublicationTaskStatus.NEEDS_REVIEW})
    )
    published = await service.review(
        second.task_id,
        True,
        "https://www.xiaohongshu.com/explore/synthetic",
    )
    assert published.status is PublicationTaskStatus.PUBLISHED
    assert published.result_url


async def test_original_video_and_expired_platform_retry_are_rejected(
    tmp_path,
) -> None:
    """确保视频原创误配和已失效的官方排期不会进入扩展执行。

    Args:
        tmp_path: pytest 提供的临时目录。
    """
    repository = SqlitePublicationTaskRepository(tmp_path.joinpath("state.db"))
    service = PublicationTaskService(
        repository,
        PublicationScheduler(repository),
    )
    video = make_publication_draft().model_copy(deep=True)
    video.assets[0].media_type = "video/mp4"
    video.is_original = True
    with pytest.raises(PublicationError, match="原创声明只支持图文"):
        await service.submit(video, PublicationMode.MANUAL, None)

    platform = await service.submit(
        make_publication_draft("platform"),
        PublicationMode.PLATFORM_SCHEDULED,
        datetime.now(UTC) + timedelta(hours=2),
    )
    await repository.save_task(
        platform.model_copy(
            update={
                "status": PublicationTaskStatus.FAILED,
                "scheduled_at": datetime.now(UTC) + timedelta(minutes=30),
            }
        )
    )
    with pytest.raises(PublicationError, match="官方定时时间已失效"):
        await service.retry(platform.task_id)
