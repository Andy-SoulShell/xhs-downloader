"""旧浏览器任务快照的读取时安全升级。"""

from collections.abc import Sequence
from pathlib import Path

from aiosqlite import Connection
from xhs_core.domain import (
    BrowserTask,
    BrowserTaskStatus,
    sanitize_stored_browser_task,
)

from .browser_task_storage import browser_task_matches_storage, parse_browser_task
from .connection import connect


async def _load_safe_browser_tasks(
    database: Connection,
    rows: Sequence[tuple[str, str | None, str, str, str, str | None, str, str, str]],
) -> list[BrowserTask]:
    """解析、清洗并原位升级旧浏览器任务。

    Args:
        database: 当前查询使用的 SQLite 连接。
        rows: 查询返回的任务身份、路由列与原始 JSON 快照。

    Returns:
        已隔离损坏记录且不含旧敏感诊断的任务列表。
    """
    tasks: list[BrowserTask] = []
    changed = False
    for row in rows:
        (
            task_id,
            request_id,
            kind,
            status,
            driver,
            lease_expires_at,
            created_at,
            updated_at,
            payload,
        ) = row
        task = parse_browser_task(payload)
        if task is None or not browser_task_matches_storage(
            task,
            task_id,
            request_id,
            kind,
            status,
            driver,
            lease_expires_at,
            created_at,
            updated_at,
        ):
            cursor = await database.execute(
                """
                DELETE FROM browser_task
                WHERE task_id = ? AND payload = ?
                """,
                (task_id, payload),
            )
            changed = changed or cursor.rowcount == 1
            continue
        safe_task = sanitize_stored_browser_task(task)
        tasks.append(safe_task)
        safe_payload = safe_task.model_dump_json()
        terminal = task.status in {
            BrowserTaskStatus.FAILED,
            BrowserTaskStatus.NEEDS_REVIEW,
        }
        if safe_task == task and (not terminal or safe_payload == payload):
            continue
        cursor = await database.execute(
            """
            UPDATE browser_task SET payload = ?
            WHERE task_id = ? AND payload = ?
            """,
            (safe_payload, task.task_id, payload),
        )
        changed = changed or cursor.rowcount == 1
    if changed:
        await database.commit()
    return tasks


async def fetch_safe_browser_tasks(
    database_path: Path,
    query: str,
    parameters: tuple,
) -> list[BrowserTask]:
    """执行只读查询并应用浏览器任务快照安全升级。

    Args:
        database_path: 状态数据库路径。
        query: 只返回标准任务快照列的查询。
        parameters: 查询绑定参数。

    Returns:
        已清洗且与冗余列一致的任务列表。
    """
    async with connect(database_path) as database:
        cursor = await database.execute(query, parameters)
        return await _load_safe_browser_tasks(database, await cursor.fetchall())
