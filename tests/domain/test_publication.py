"""内容发布领域模型测试。"""

from datetime import UTC, datetime

from xhs_core.domain import (
    BrowserDriver,
    PublicationMode,
    PublicationTask,
    PublicationTaskStatus,
)

from tests.helpers import make_publication_draft


def test_publication_draft_normalizes_tags_and_has_stable_fingerprint() -> None:
    """确保标签清理且无关时间变化不会改变内容指纹。"""
    draft = make_publication_draft()
    updated = draft.model_copy(update={"updated_at": datetime.now(UTC)})

    assert draft.tags == ["测试", "合成"]
    assert draft.fingerprint() == updated.fingerprint()
    assert len(draft.fingerprint()) == 64


def test_publication_fingerprint_changes_with_publishable_content() -> None:
    """确保标题、正文、标签或素材变化会产生不同指纹。"""
    draft = make_publication_draft()
    variants = [
        draft.model_copy(update={"title": "另一标题"}),
        draft.model_copy(update={"body": "另一正文"}),
        draft.model_copy(update={"tags": ["另一标签"]}),
        draft.model_copy(update={"assets": []}),
    ]

    assert all(item.fingerprint() != draft.fingerprint() for item in variants)


def test_publication_task_round_trips_as_json() -> None:
    """确保冻结发布包和状态可以无损持久化。"""
    draft = make_publication_draft()
    task = PublicationTask(
        task_id="synthetic-task",
        package=draft,
        package_fingerprint=draft.fingerprint(),
        mode=PublicationMode.MANUAL,
        status=PublicationTaskStatus.READY,
        scheduled_at=draft.updated_at,
        created_at=draft.created_at,
        updated_at=draft.updated_at,
    )

    restored = PublicationTask.model_validate_json(task.model_dump_json())

    assert restored == task
    assert restored.package is not draft
    assert restored.target_driver is BrowserDriver.EXTENSION
    assert restored.publish_attempted is False
