"""发布任务、调度与执行用例测试。"""

from asyncio import sleep
from datetime import UTC, datetime, timedelta

import pytest

from src.application import (
    ExtensionCredentialService,
    PublicationExecutionService,
    PublicationScheduler,
    PublicationTaskService,
)
from src.domain import PublicationError, PublicationMode, PublicationTaskStatus
from src.infrastructure import (
    FilePublicationAssetStore,
    SqliteExtensionCredentialRepository,
    SqlitePublicationTaskRepository,
)
from tests.helpers import make_publication_draft


def _services(tmp_path, lease_seconds: int = 60):
    database = tmp_path.joinpath("state.db")
    repository = SqlitePublicationTaskRepository(database)
    scheduler = PublicationScheduler(repository, interval=0.01)
    assets = FilePublicationAssetStore(tmp_path.joinpath("publication"))
    return (
        repository,
        scheduler,
        PublicationTaskService(repository, scheduler),
        PublicationExecutionService(
            repository,
            assets,
            scheduler,
            lease_seconds,
        ),
        assets,
    )


async def test_task_service_submits_idempotent_manual_and_scheduled_tasks(
    tmp_path,
) -> None:
    """确保同类重复提交幂等，而手动与定时任务彼此独立。

    Args:
        tmp_path: pytest 提供的临时目录。
    """
    _, scheduler, tasks, _, _ = _services(tmp_path)
    draft = make_publication_draft()
    manual = await tasks.submit(draft, PublicationMode.MANUAL, None)
    repeated = await tasks.submit(draft, PublicationMode.MANUAL, None)
    scheduled_at = datetime.now(UTC) + timedelta(hours=1)
    scheduled = await tasks.submit(
        draft,
        PublicationMode.SCHEDULED,
        scheduled_at,
    )

    assert manual.task_id == repeated.task_id
    assert manual.status is PublicationTaskStatus.READY
    assert scheduled.task_id != manual.task_id
    assert scheduled.status is PublicationTaskStatus.SCHEDULED
    assert len(await tasks.list_recent(10)) == 2
    await scheduler.close()


@pytest.mark.parametrize(
    ("draft", "mode", "scheduled_at", "message"),
    [
        (
            make_publication_draft(with_asset=False),
            PublicationMode.MANUAL,
            None,
            "素材",
        ),
        (
            make_publication_draft().model_copy(update={"title": "", "body": ""}),
            PublicationMode.MANUAL,
            None,
            "不能同时为空",
        ),
        (
            make_publication_draft(),
            PublicationMode.SCHEDULED,
            datetime.now(),
            "包含时区",
        ),
        (
            make_publication_draft(),
            PublicationMode.SCHEDULED,
            datetime.now(UTC) - timedelta(minutes=1),
            "晚于当前时间",
        ),
    ],
)
async def test_task_service_rejects_invalid_packages_and_schedules(
    tmp_path,
    draft,
    mode: PublicationMode,
    scheduled_at: datetime | None,
    message: str,
) -> None:
    """确保提交前完整校验发布包和计划时间。

    Args:
        tmp_path: pytest 提供的临时目录。
        draft: 合成发布草稿。
        mode: 发布触发模式。
        scheduled_at: 合成计划时间。
        message: 预期错误片段。
    """
    _, _, tasks, _, _ = _services(tmp_path)
    with pytest.raises(PublicationError, match=message):
        await tasks.submit(draft, mode, scheduled_at)


async def test_task_service_rejects_unsupported_asset_combinations(
    tmp_path,
) -> None:
    """确保绕过草稿用例的混合素材仍会在提交边界被拒绝。

    Args:
        tmp_path: pytest 提供的临时目录。
    """
    _, _, tasks, _, _ = _services(tmp_path)
    draft = make_publication_draft()
    video = draft.assets[0].model_copy(
        update={
            "asset_id": "video",
            "filename": "video.mp4",
            "media_type": "video/mp4",
            "position": 1,
        }
    )
    mixed = draft.model_copy(update={"assets": [draft.assets[0], video]})

    with pytest.raises(PublicationError, match="不能混合"):
        await tasks.submit(mixed, PublicationMode.MANUAL, None)


async def test_task_service_cancels_and_retries_allowed_states(tmp_path) -> None:
    """确保任务仅能在规定状态取消或重试。

    Args:
        tmp_path: pytest 提供的临时目录。
    """
    repository, _, tasks, _, _ = _services(tmp_path)
    task = await tasks.submit(make_publication_draft(), PublicationMode.MANUAL, None)
    canceled = await tasks.cancel(task.task_id)
    assert canceled.status is PublicationTaskStatus.CANCELED
    with pytest.raises(PublicationError, match="不能取消"):
        await tasks.cancel(task.task_id)
    failed = canceled.model_copy(update={"status": PublicationTaskStatus.FAILED})
    await repository.save_task(failed)
    retried = await tasks.retry(task.task_id)

    assert retried.status is PublicationTaskStatus.READY
    with pytest.raises(PublicationError, match="可以重试"):
        await tasks.retry(task.task_id)
    with pytest.raises(PublicationError, match="不存在"):
        await tasks.require("missing")


async def test_scheduler_releases_expired_and_uncertain_tasks(tmp_path) -> None:
    """确保到期排期、失效租约与未确认发布结果正确恢复。

    Args:
        tmp_path: pytest 提供的临时目录。
    """
    repository, scheduler, tasks, execution, _ = _services(tmp_path)
    draft = make_publication_draft()
    scheduled = await tasks.submit(
        draft,
        PublicationMode.SCHEDULED,
        datetime.now(UTC) + timedelta(milliseconds=1),
    )
    await scheduler.start()
    await sleep(0.03)
    ready = await tasks.require(scheduled.task_id)
    assert ready.status is PublicationTaskStatus.READY

    claimed = await execution.claim("extension", scheduled.task_id)
    expired = claimed.task.model_copy(
        update={"lease_expires_at": datetime.now(UTC) - timedelta(seconds=1)}
    )
    await repository.save_task(expired)
    await scheduler.reconcile()
    recovered = await tasks.require(scheduled.task_id)
    assert recovered.status is PublicationTaskStatus.READY

    claimed = await execution.claim("extension", scheduled.task_id)
    publishing = claimed.task.model_copy(
        update={
            "status": PublicationTaskStatus.PUBLISHING,
            "lease_expires_at": datetime.now(UTC) - timedelta(seconds=1),
        }
    )
    await repository.save_task(publishing)
    await scheduler.reconcile()
    assert (
        await tasks.require(scheduled.task_id)
    ).status is PublicationTaskStatus.NEEDS_REVIEW
    await scheduler.close()


async def test_execution_claims_assets_and_advances_state_machine(tmp_path) -> None:
    """确保扩展租约保护素材访问并只允许明确状态转换。

    Args:
        tmp_path: pytest 提供的临时目录。
    """
    _, _, tasks, execution, assets = _services(tmp_path)
    draft = make_publication_draft()
    path = assets.path_for(draft.draft_id, draft.assets[0])
    path.parent.mkdir(parents=True)
    path.write_bytes(b"x" * draft.assets[0].size)
    task = await tasks.submit(draft, PublicationMode.MANUAL, None)
    claim = await execution.claim("extension", task.task_id)

    assert claim is not None
    assert await execution.claim("other", task.task_id) is None
    with pytest.raises(PublicationError, match="租约无效"):
        await execution.asset_path(task.task_id, "wrong", draft.assets[0].asset_id)
    assert (
        await execution.asset_path(
            task.task_id,
            claim.lease_token,
            draft.assets[0].asset_id,
        )
        == path
    )
    filling = await execution.update_status(
        task.task_id,
        claim.lease_token,
        PublicationTaskStatus.FILLING,
        "正在填充",
    )
    assert filling.status is PublicationTaskStatus.FILLING
    with pytest.raises(PublicationError, match="不能从"):
        await execution.update_status(
            task.task_id,
            claim.lease_token,
            PublicationTaskStatus.PUBLISHED,
            "跳过发布",
        )
    await execution.update_status(
        task.task_id,
        claim.lease_token,
        PublicationTaskStatus.PUBLISHING,
        "已经点击发布",
    )
    published = await execution.update_status(
        task.task_id,
        claim.lease_token,
        PublicationTaskStatus.PUBLISHED,
        "发布成功",
        "https://www.xiaohongshu.com/explore/synthetic",
    )

    assert published.status is PublicationTaskStatus.PUBLISHED
    assert published.result_url.endswith("/synthetic")
    with pytest.raises(PublicationError, match="租约无效"):
        await execution.asset_path(
            task.task_id,
            claim.lease_token,
            draft.assets[0].asset_id,
        )


async def test_extension_credential_service_rotates_tokens(tmp_path) -> None:
    """确保扩展能力令牌随机签发且重新登记后旧令牌失效。

    Args:
        tmp_path: pytest 提供的临时目录。
    """
    service = ExtensionCredentialService(
        SqliteExtensionCredentialRepository(tmp_path.joinpath("state.db"))
    )
    first = await service.register("extension")
    assert await service.validate("extension", first)
    second = await service.register("extension")

    assert first != second
    assert not await service.validate("extension", first)
    assert await service.validate("extension", second)
