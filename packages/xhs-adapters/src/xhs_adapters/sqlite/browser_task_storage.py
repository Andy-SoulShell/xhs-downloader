"""浏览器任务 SQLite 存储的底层辅助函数。"""

from datetime import datetime
from pathlib import Path

from aiosqlite import Connection, connect
from loguru import logger
from pydantic import ValidationError
from xhs_core.domain import BrowserDriver, BrowserTask, BrowserTaskStatus


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
    except ValidationError as error:
        logger.warning("忽略无效浏览器任务：{}", error)
        return None


async def first_queued_browser_task(
    database: Connection,
    target_driver: BrowserDriver,
) -> BrowserTask | None:
    """读取指定驱动最早的排队任务。

    Args:
        database: 已进入写事务的数据库连接。
        target_driver: 任务固定执行驱动。

    Returns:
        已验证任务；队列为空或记录损坏时返回 ``None``。
    """
    cursor = await database.execute(
        """
        SELECT payload FROM browser_task
        WHERE status = ? AND target_driver = ?
        ORDER BY created_at LIMIT 1
        """,
        (BrowserTaskStatus.QUEUED.value, target_driver.value),
    )
    row = await cursor.fetchone()
    task = parse_browser_task(row[0]) if row else None
    if task is None or task.target_driver is not target_driver:
        return None
    return task


def browser_task_parameters(task: BrowserTask) -> tuple:
    """生成浏览器任务插入参数。

    Args:
        task: 完整任务快照。

    Returns:
        与浏览器任务插入语句顺序一致的参数。
    """
    return (
        task.task_id,
        task.request_id,
        task.kind.value,
        task.target_driver.value,
        task.status.value,
        task.model_dump_json(),
        _iso(task.lease_expires_at),
        task.created_at.isoformat(),
        task.updated_at.isoformat(),
    )


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None
