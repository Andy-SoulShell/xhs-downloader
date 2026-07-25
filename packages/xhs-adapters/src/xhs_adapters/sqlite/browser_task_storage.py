"""浏览器任务 SQLite 存储的底层辅助函数。"""

from pathlib import Path

from aiosqlite import connect
from loguru import logger
from pydantic import ValidationError
from xhs_core.domain import BrowserTask


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
                status TEXT NOT NULL,
                payload TEXT NOT NULL,
                lease_hash TEXT,
                lease_expires_at TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS browser_task_queue
                ON browser_task(status, created_at);
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
