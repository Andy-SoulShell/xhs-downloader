"""浏览器任务 SQLite 存储的底层辅助函数。"""

from datetime import datetime
from pathlib import Path

from aiosqlite import Connection
from loguru import logger
from pydantic import ValidationError
from xhs_core.domain import (
    BrowserDriver,
    BrowserTask,
    BrowserTaskStatus,
    sanitize_stored_browser_task,
)

from .connection import connect


async def initialize_browser_task_storage(database_path: Path) -> None:
    """创建浏览器任务表与查询索引。

    Args:
        database_path: 状态数据库路径。
    """
    database_path.parent.mkdir(parents=True, exist_ok=True)
    async with connect(database_path) as database:
        await database.executescript(
            """
            CREATE TABLE IF NOT EXISTS browser_task (
                task_id TEXT PRIMARY KEY,
                request_id TEXT UNIQUE,
                kind TEXT NOT NULL,
                target_driver TEXT NOT NULL DEFAULT 'extension',
                status TEXT NOT NULL,
                payload TEXT NOT NULL,
                lease_hash TEXT,
                lease_expires_at TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS browser_task_queue
                ON browser_task(status, created_at);
            """
        )
        cursor = await database.execute("PRAGMA table_info(browser_task)")
        columns = {row[1] for row in await cursor.fetchall()}
        if "target_driver" not in columns:
            await database.execute(
                """
                ALTER TABLE browser_task
                ADD COLUMN target_driver TEXT NOT NULL DEFAULT 'extension'
                """
            )
        await database.executescript(
            """
            CREATE INDEX IF NOT EXISTS browser_task_driver_queue
                ON browser_task(status, target_driver, created_at);
            CREATE INDEX IF NOT EXISTS browser_task_lease
                ON browser_task(status, lease_expires_at);
            """
        )
        await database.commit()


def parse_browser_task(payload: str) -> BrowserTask | None:
    """解析持久化任务，隔离损坏记录。

    Args:
        payload: JSON 任务快照。

    Returns:
        通过模型校验的任务；记录损坏时返回 ``None``。
    """
    try:
        return BrowserTask.model_validate_json(payload)
    except ValidationError:
        logger.warning("忽略无法解析的浏览器任务记录")
        return None


def browser_task_matches_storage(
    task: BrowserTask,
    task_id: str,
    request_id: str | None,
    kind: str,
    status: str,
    target_driver: str,
    lease_expires_at: str | None,
    created_at: str,
    updated_at: str,
) -> bool:
    """核对 JSON 快照与用于查询、排序和领取的冗余列。

    Args:
        task: 已通过 Schema 校验的任务快照。
        task_id: 表中的任务标识。
        request_id: 表中的幂等请求标识。
        kind: 表中的任务类型。
        status: 表中的任务状态。
        target_driver: 表中的目标执行器。
        lease_expires_at: 表中的租约到期时间。
        created_at: 表中的创建时间。
        updated_at: 表中的更新时间。

    Returns:
        所有任务身份和路由字段完全一致时返回真。
    """
    try:
        stored_lease = (
            datetime.fromisoformat(lease_expires_at)
            if lease_expires_at is not None
            else None
        )
        stored_created = datetime.fromisoformat(created_at)
        stored_updated = datetime.fromisoformat(updated_at)
    except (TypeError, ValueError):
        return False
    return all(
        (
            task.task_id == task_id,
            task.request_id == request_id,
            task.kind.value == kind,
            task.status.value == status,
            task.target_driver.value == target_driver,
            task.lease_expires_at == stored_lease,
            task.created_at == stored_created,
            task.updated_at == stored_updated,
        )
    )


async def save_browser_task_if_snapshot(
    database_path: Path,
    task: BrowserTask,
    expected: BrowserTaskStatus,
    expected_updated_at: datetime | None,
    expected_lease_expires_at: datetime | None,
    expected_lease_hash: str | None,
    clear_lease: bool,
) -> bool:
    """按状态和可选租约版本比较交换浏览器任务。

    Args:
        database_path: 状态数据库路径。
        task: 待保存的新任务快照。
        expected: 数据库必须匹配的旧状态。
        expected_updated_at: 可选的旧快照更新时间。
        expected_lease_expires_at: 可选的旧租约到期时间。
        expected_lease_hash: 可选的当前租约摘要。
        clear_lease: 是否随状态更新原子清除旧租约。

    Returns:
        完整匹配预期快照并更新一条记录时返回真。
    """
    safe_task = sanitize_stored_browser_task(task)
    updated_clause = " AND updated_at = ?" if expected_updated_at else ""
    lease_clause = " AND lease_expires_at = ?" if expected_lease_expires_at else ""
    hash_clause = " AND lease_hash = ?" if expected_lease_hash else ""
    clear_clause = ", lease_hash = NULL" if clear_lease else ""
    parameters = (
        safe_task.status.value,
        safe_task.model_dump_json(),
        _iso(safe_task.lease_expires_at),
        safe_task.updated_at.isoformat(),
        safe_task.task_id,
        expected.value,
        *((expected_updated_at.isoformat(),) if expected_updated_at else ()),
        *(
            (expected_lease_expires_at.isoformat(),)
            if expected_lease_expires_at
            else ()
        ),
        *((expected_lease_hash,) if expected_lease_hash else ()),
    )
    async with connect(database_path) as database:
        cursor = await database.execute(
            f"""
            UPDATE browser_task SET
                status = ?, payload = ?, lease_expires_at = ?, updated_at = ?
                {clear_clause}
            WHERE task_id = ? AND status = ?
                {updated_clause}
                {lease_clause}
                {hash_clause}
            """,
            parameters,
        )
        await database.commit()
    return cursor.rowcount == 1


async def first_queued_browser_task(
    database: Connection,
    target_driver: BrowserDriver,
) -> tuple[BrowserTask | None, bool]:
    """读取指定驱动最早的排队任务。

    Args:
        database: 已进入写事务的数据库连接。
        target_driver: 任务固定执行驱动。

    Returns:
        已验证任务及是否清理过损坏记录；队列为空时任务为 ``None``。
    """
    cleaned = False
    while True:
        cursor = await database.execute(
            """
            SELECT task_id, request_id, kind, status, target_driver,
                   lease_expires_at, created_at, updated_at, payload
            FROM browser_task
            WHERE status = ? AND target_driver = ?
            ORDER BY created_at LIMIT 100
            """,
            (BrowserTaskStatus.QUEUED.value, target_driver.value),
        )
        rows = await cursor.fetchall()
        if not rows:
            return None, cleaned
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
            valid = task and browser_task_matches_storage(
                task,
                task_id,
                request_id,
                kind,
                status,
                driver,
                lease_expires_at,
                created_at,
                updated_at,
            )
            if valid:
                return task, cleaned
            await database.execute(
                "DELETE FROM browser_task WHERE task_id = ? AND payload = ?",
                (task_id, payload),
            )
            cleaned = True


def browser_task_parameters(task: BrowserTask) -> tuple:
    """生成浏览器任务插入参数。

    Args:
        task: 完整任务快照。

    Returns:
        与浏览器任务插入语句顺序一致的参数。
    """
    safe_task = sanitize_stored_browser_task(task)
    return (
        safe_task.task_id,
        safe_task.request_id,
        safe_task.kind.value,
        safe_task.target_driver.value,
        safe_task.status.value,
        safe_task.model_dump_json(),
        _iso(safe_task.lease_expires_at),
        safe_task.created_at.isoformat(),
        safe_task.updated_at.isoformat(),
    )


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None
