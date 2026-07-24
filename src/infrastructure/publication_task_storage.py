"""发布任务 SQLite 存储的底层辅助函数。"""

from pathlib import Path

from aiosqlite import connect
from loguru import logger
from pydantic import ValidationError

from src.domain import PublicationTask, PublicationTaskStatus


async def initialize_publication_task_storage(database_path: Path) -> None:
    """创建发布任务表与索引。

    Args:
        database_path: 状态数据库路径。
    """
    database_path.parent.mkdir(parents=True, exist_ok=True)
    async with connect(database_path) as database:
        await database.executescript(
            """
            CREATE TABLE IF NOT EXISTS publication_task (
                task_id TEXT PRIMARY KEY,
                draft_id TEXT NOT NULL,
                mode TEXT NOT NULL,
                status TEXT NOT NULL,
                scheduled_at TEXT NOT NULL,
                payload TEXT NOT NULL,
                lease_hash TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS publication_task_status
                ON publication_task(status, scheduled_at);
            """
        )
        columns = {
            row[1]
            for row in await (
                await database.execute("PRAGMA table_info(publication_task)")
            ).fetchall()
        }
        if "mode" not in columns:
            await database.execute(
                """
                ALTER TABLE publication_task
                ADD COLUMN mode TEXT NOT NULL DEFAULT 'manual'
                """
            )
            cursor = await database.execute(
                "SELECT task_id, payload FROM publication_task"
            )
            for task_id, payload in await cursor.fetchall():
                task = parse_publication_task(payload)
                if task:
                    await database.execute(
                        "UPDATE publication_task SET mode = ? WHERE task_id = ?",
                        (task.mode.value, task_id),
                    )
        await database.commit()


def parse_publication_task(payload: str) -> PublicationTask | None:
    """解析持久化任务，忽略损坏的旧记录。

    Args:
        payload: JSON 任务快照。

    Returns:
        通过模型校验的任务；记录损坏时返回 ``None``。
    """
    try:
        return PublicationTask.model_validate_json(payload)
    except ValidationError as error:
        logger.warning("忽略无效发布任务：{}", error)
        return None


def publication_claim_query(
    preferred_task_id: str | None,
) -> tuple[str, tuple[str, ...]]:
    """构造领取指定任务或最早任务的查询。

    Args:
        preferred_task_id: 手动发布指定的任务标识。

    Returns:
        参数化 SQL 与参数元组。
    """
    if preferred_task_id:
        return (
            """
            SELECT payload FROM publication_task
            WHERE task_id = ? AND status = ?
            """,
            (preferred_task_id, PublicationTaskStatus.READY.value),
        )
    return (
        """
        SELECT payload FROM publication_task
        WHERE status = ? AND mode = ? ORDER BY scheduled_at LIMIT 1
        """,
        (
            PublicationTaskStatus.READY.value,
            "scheduled",
        ),
    )
