"""SQLite 下载记录仓储。"""

from datetime import UTC, datetime
from pathlib import Path

from aiosqlite import connect
from loguru import logger
from pydantic import ValidationError
from xhs_core.domain.models import DownloadRecord


class SqliteDownloadRepository:
    """把每个作品的最新下载记录持久化到 SQLite。

    Args:
        database: SQLite 数据库文件路径。
    """

    def __init__(self, database: Path) -> None:
        self._database = database
        self._initialized = False

    async def get(self, work_id: str) -> DownloadRecord | None:
        """读取作品下载记录。

        Args:
            work_id: 作品 ID。

        Returns:
            已验证的记录；不存在时返回 ``None``。
        """
        await self._initialize()
        async with connect(self._database) as database:
            cursor = await database.execute(
                "SELECT payload FROM download_record WHERE work_id = ?",
                (work_id,),
            )
            row = await cursor.fetchone()
        if not row:
            return None
        try:
            return DownloadRecord.model_validate_json(row[0])
        except ValidationError:
            logger.warning("下载记录无效，将重新下载")
            return None

    async def save(self, record: DownloadRecord) -> None:
        """覆盖保存作品的最新下载记录。

        Args:
            record: 含内容指纹和文件哈希的完整记录。
        """
        await self._initialize()
        payload = record.model_dump_json()
        async with connect(self._database) as database:
            await database.execute(
                """
                INSERT INTO download_record (work_id, payload, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(work_id) DO UPDATE SET
                    payload = excluded.payload,
                    updated_at = excluded.updated_at
                """,
                (record.work_id, payload, datetime.now(UTC).isoformat()),
            )
            await database.commit()

    async def _initialize(self) -> None:
        if self._initialized:
            return
        self._database.parent.mkdir(parents=True, exist_ok=True)
        async with connect(self._database) as database:
            await database.execute(
                """
                CREATE TABLE IF NOT EXISTS download_record (
                    work_id TEXT PRIMARY KEY,
                    payload TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )
            await database.commit()
        self._initialized = True
