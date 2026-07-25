"""受管发布素材完整性与发布尝试标记测试。"""

from hashlib import sha256
from pathlib import Path

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
    PublicationTaskStatus,
    PublicationVisibility,
)

from tests.helpers import make_publication_draft


def _services(tmp_path: Path):
    repository = SqlitePublicationTaskRepository(tmp_path.joinpath("state.db"))
    scheduler = PublicationScheduler(repository)
    assets = FilePublicationAssetStore(tmp_path.joinpath("publication"))
    return (
        PublicationTaskService(repository, scheduler),
        PublicationExecutionService(repository, assets, scheduler, 60),
        assets,
    )


async def test_managed_asset_paths_are_ordered_and_fingerprint_verified(
    tmp_path: Path,
) -> None:
    """确保受管执行器只能取得任务内有序且摘要匹配的素材路径。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    tasks, execution, assets = _services(tmp_path)
    draft = make_publication_draft().model_copy(deep=True)
    draft.visibility = PublicationVisibility.PRIVATE
    first_content = b"first-synthetic-image"
    second_content = b"second-synthetic-image"
    first = draft.assets[0].model_copy(
        update={
            "size": len(first_content),
            "sha256": sha256(first_content).hexdigest(),
            "position": 1,
        }
    )
    second = first.model_copy(
        update={
            "asset_id": "synthetic-second",
            "filename": "synthetic-second.jpg",
            "size": len(second_content),
            "sha256": sha256(second_content).hexdigest(),
            "position": 0,
        }
    )
    draft.assets = [first, second]
    first_path = assets.path_for(draft.draft_id, first)
    second_path = assets.path_for(draft.draft_id, second)
    first_path.parent.mkdir(parents=True)
    first_path.write_bytes(first_content)
    second_path.write_bytes(second_content)
    task = await tasks.submit(
        draft,
        PublicationMode.MANUAL,
        None,
        BrowserDriver.MANAGED,
    )
    claim = await execution.claim(
        "managed-worker",
        target_driver=BrowserDriver.MANAGED,
    )

    assert claim is not None
    assert await execution.asset_paths(
        task.task_id,
        claim.lease_token,
    ) == (second_path, first_path)

    first_path.write_bytes(b"x" * len(first_content))
    with pytest.raises(PublicationError, match="内容指纹"):
        await execution.asset_paths(task.task_id, claim.lease_token)


async def test_publish_attempt_marker_is_monotonic_and_stage_limited(
    tmp_path: Path,
) -> None:
    """确保发布点击安全标记只能设置一次且不能回退。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    tasks, execution, _ = _services(tmp_path)
    draft = make_publication_draft().model_copy(
        update={"visibility": PublicationVisibility.PRIVATE}
    )
    task = await tasks.submit(
        draft,
        PublicationMode.MANUAL,
        None,
        BrowserDriver.MANAGED,
    )
    claim = await execution.claim(
        "managed-worker",
        target_driver=BrowserDriver.MANAGED,
    )
    assert claim is not None
    await execution.update_status(
        task.task_id,
        claim.lease_token,
        PublicationTaskStatus.FILLING,
        "正在填写",
    )
    publishing = await execution.update_status(
        task.task_id,
        claim.lease_token,
        PublicationTaskStatus.PUBLISHING,
        "即将点击",
        publish_attempted=True,
    )

    assert publishing.publish_attempted is True
    with pytest.raises(PublicationError, match="不能清除"):
        await execution.update_status(
            task.task_id,
            claim.lease_token,
            PublicationTaskStatus.PUBLISHING,
            "错误回退",
            publish_attempted=False,
        )
    fresh_draft = make_publication_draft("synthetic-stage-limit").model_copy(
        update={
            "title": "合成阶段限制标题",
            "visibility": PublicationVisibility.PRIVATE,
        }
    )
    fresh = await tasks.submit(
        fresh_draft,
        PublicationMode.MANUAL,
        None,
        BrowserDriver.MANAGED,
    )
    fresh_claim = await execution.claim(
        "managed-worker-2",
        target_driver=BrowserDriver.MANAGED,
    )
    assert fresh_claim is not None
    with pytest.raises(PublicationError, match="只能用于"):
        await execution.update_status(
            fresh.task_id,
            fresh_claim.lease_token,
            PublicationTaskStatus.FILLING,
            "错误标记",
            publish_attempted=True,
        )
