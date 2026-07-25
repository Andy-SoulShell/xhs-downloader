"""SQLite 旧浏览器任务敏感诊断升级测试。"""

import json
from datetime import UTC, datetime, timedelta

from aiosqlite import connect
from loguru import logger
from xhs_adapters.sqlite import SqliteBrowserTaskRepository
from xhs_adapters.sqlite.browser_task_storage import parse_browser_task
from xhs_core.domain import BrowserTask, BrowserTaskKind, BrowserTaskStatus


def _legacy_task(
    task_id: str,
    status: BrowserTaskStatus,
    secret: str,
) -> BrowserTask:
    now = datetime.now(UTC)
    return BrowserTask(
        task_id=task_id,
        request_id=f"request-{task_id}",
        kind=BrowserTaskKind.CHECK_LOGIN_STATUS,
        status=status,
        result={
            "adapter_version": "xhs-web-2026.07",
            "selector_profile": "initial-state-v1",
            "page_kind": "home",
            "matched_anchors": ["main_container", "authorization"],
            "missing_anchors": ["initial_state", "raw_page"],
            "url": "https://example.invalid/private",
            "token": secret,
            "raw_page": "<html>用户原文</html>",
        },
        message=f"页面异常 {secret} https://example.invalid/private 用户原文",
        created_at=now,
        updated_at=now,
    )


async def _insert_legacy_payload(
    database,
    task: BrowserTask,
    payload: str | None = None,
) -> None:
    async with connect(database) as connection:
        await connection.execute(
            """
            INSERT INTO browser_task (
                task_id, request_id, kind, target_driver, status, payload,
                lease_hash, lease_expires_at, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)
            """,
            (
                task.task_id,
                task.request_id,
                task.kind.value,
                task.target_driver.value,
                task.status.value,
                payload or task.model_dump_json(),
                task.created_at.isoformat(),
                task.updated_at.isoformat(),
            ),
        )
        await connection.commit()


async def _stored_payload(database, task_id: str) -> str:
    async with connect(database) as connection:
        row = await (
            await connection.execute(
                "SELECT payload FROM browser_task WHERE task_id = ?",
                (task_id,),
            )
        ).fetchone()
    assert row is not None
    return row[0]


async def _insert_invalid_payload(
    database,
    task_id: str,
    status: BrowserTaskStatus,
    created_at: datetime,
    payload: str,
) -> None:
    async with connect(database) as connection:
        await connection.execute(
            """
            INSERT INTO browser_task (
                task_id, request_id, kind, target_driver, status, payload,
                lease_hash, lease_expires_at, created_at, updated_at
            ) VALUES (?, NULL, ?, 'extension', ?, ?, NULL, NULL, ?, ?)
            """,
            (
                task_id,
                BrowserTaskKind.CHECK_LOGIN_STATUS.value,
                status.value,
                payload,
                created_at.isoformat(),
                created_at.isoformat(),
            ),
        )
        await connection.commit()


async def test_repository_list_and_get_upgrade_legacy_terminal_data(
    tmp_path,
) -> None:
    """确保 list/get 加载旧终态时立即清洗并持久化。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    database = tmp_path.joinpath("state.db")
    repository = SqliteBrowserTaskRepository(database)
    await repository.list_recent(1)
    failed_secret = "legacy-failed-secret"
    failed = _legacy_task(
        "legacy-failed",
        BrowserTaskStatus.FAILED,
        failed_secret,
    )
    await _insert_legacy_payload(database, failed)

    listed = await repository.list_recent(10)
    listed_payload = await _stored_payload(database, failed.task_id)

    assert listed[0].message == "浏览器任务执行失败，可安全重试"
    assert listed[0].result == {
        "adapter_version": "xhs-web-2026.07",
        "selector_profile": "initial-state-v1",
        "page_kind": "home",
        "matched_anchors": ["main_container"],
        "missing_anchors": ["initial_state"],
    }
    assert failed_secret not in listed_payload
    assert "example.invalid" not in listed_payload
    assert "用户原文" not in listed_payload

    review_secret = "legacy-review-secret"
    review = _legacy_task(
        "legacy-review",
        BrowserTaskStatus.NEEDS_REVIEW,
        review_secret,
    )
    await _insert_legacy_payload(database, review)

    fetched = await repository.get(review.task_id)
    fetched_payload = await _stored_payload(database, review.task_id)

    assert fetched is not None
    assert fetched.message == "浏览器操作结果无法确认，请人工核对平台状态"
    assert fetched.result == listed[0].result
    assert review_secret not in fetched_payload
    assert "example.invalid" not in fetched_payload
    assert "用户原文" not in fetched_payload
    assert json.loads(fetched_payload)["message"] == fetched.message


async def test_repository_removes_legacy_terminal_extra_fields(tmp_path) -> None:
    """确保已被模型忽略的旧调试字段也会从终态记录中删除。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    database = tmp_path.joinpath("state.db")
    repository = SqliteBrowserTaskRepository(database)
    await repository.list_recent(1)
    task = _legacy_task(
        "legacy-extra-fields",
        BrowserTaskStatus.FAILED,
        "synthetic-replaced-secret",
    ).model_copy(
        update={
            "message": "浏览器任务执行失败，可安全重试",
            "result": None,
        }
    )
    sensitive = "synthetic-extra-sensitive-fragment"
    raw = task.model_dump(mode="json")
    raw["debug"] = {
        "raw_page": f"<html>{sensitive}</html>",
        "token": sensitive,
    }
    await _insert_legacy_payload(
        database,
        task,
        json.dumps(raw, ensure_ascii=False),
    )

    loaded = await repository.get(task.task_id)
    stored = await _stored_payload(database, task.task_id)

    assert loaded == task
    assert sensitive not in stored
    assert "debug" not in json.loads(stored)


def test_invalid_payload_log_never_contains_input_fragment() -> None:
    """确保损坏记录的校验日志不复述不可信输入。"""
    sensitive = "synthetic-invalid-sensitive-fragment"
    messages: list[str] = []
    sink = logger.add(messages.append, format="{message}")
    try:
        assert (
            parse_browser_task(json.dumps({"task_id": sensitive}, ensure_ascii=False))
            is None
        )
    finally:
        logger.remove(sink)

    assert messages
    assert sensitive not in "".join(messages)


async def test_repository_removes_unparseable_records(tmp_path) -> None:
    """确保读取时删除无法恢复且可能含敏感片段的损坏快照。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    database = tmp_path.joinpath("state.db")
    repository = SqliteBrowserTaskRepository(database)
    await repository.list_recent(1)
    sensitive = "synthetic-corrupted-sensitive-fragment"
    await _insert_invalid_payload(
        database,
        "corrupted-terminal",
        BrowserTaskStatus.FAILED,
        datetime.now(UTC),
        json.dumps({"task_id": sensitive}),
    )

    assert await repository.list_recent(10) == []
    async with connect(database) as connection:
        row = await (
            await connection.execute(
                "SELECT COUNT(*) FROM browser_task WHERE task_id = ?",
                ("corrupted-terminal",),
            )
        ).fetchone()
    assert row == (0,)


async def test_corrupted_queue_head_never_starves_valid_task(tmp_path) -> None:
    """确保损坏的最早排队记录不会阻止后续有效任务被领取。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    database = tmp_path.joinpath("state.db")
    repository = SqliteBrowserTaskRepository(database)
    await repository.list_recent(1)
    now = datetime.now(UTC)
    mismatched = _legacy_task(
        "corrupted-queue-0",
        BrowserTaskStatus.FAILED,
        "synthetic-mismatched-sensitive-fragment",
    ).model_dump_json()
    for index in range(101):
        await _insert_invalid_payload(
            database,
            f"corrupted-queue-{index}",
            BrowserTaskStatus.QUEUED,
            now - timedelta(seconds=1),
            mismatched if index == 0 else '{"task_id":"synthetic-invalid"}',
        )
    valid = BrowserTask(
        task_id="valid-queued-task",
        kind=BrowserTaskKind.CHECK_LOGIN_STATUS,
        created_at=now,
        updated_at=now,
    )
    await repository.save(valid)

    claimed = await repository.claim_next(
        "synthetic-worker",
        now,
        now,
        "a" * 64,
    )

    assert claimed is not None
    assert claimed.task_id == valid.task_id
    async with connect(database) as connection:
        row = await (
            await connection.execute(
                "SELECT COUNT(*) FROM browser_task WHERE task_id LIKE ?",
                ("corrupted-queue-%",),
            )
        ).fetchone()
    assert row == (0,)
