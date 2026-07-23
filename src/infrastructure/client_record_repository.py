"""SQLite 浏览器扩展下载记录仓储。"""

from pathlib import Path

from aiosqlite import connect
from loguru import logger
from pydantic import ValidationError

from src.domain.models import ClientDownloadRecord


class SqliteClientRecordRepository:
    """在 SQLite 中幂等保存浏览器扩展下载记录。

    Args:
        database: 与下载记录共用或独立使用的 SQLite 文件路径。
    """

    def __init__(self, database: Path) -> None:
        self._database = database
        self._initialized = False

    async def save_many(self, records: list[ClientDownloadRecord]) -> int:
        """幂等保存一批客户端记录。

        Args:
            records: 扩展生成的下载记录。

        Returns:
            本次接收的记录数量。
        """
        if not records:
            return 0
        await self._initialize()
        rows = [
            (
                record.record_id,
                record.model_dump_json(),
                record.created_at.isoformat(),
            )
            for record in records
        ]
        async with connect(self._database) as database:
            await database.executemany(
                """
                INSERT INTO client_download_record (record_id, payload, created_at)
                VALUES (?, ?, ?)
                ON CONFLICT(record_id) DO UPDATE SET
                    payload = excluded.payload,
                    created_at = excluded.created_at
                """,
                rows,
            )
            await database.commit()
        return len(records)

    async def list_recent(self, limit: int) -> list[ClientDownloadRecord]:
        """读取最近的有效客户端记录。

        Args:
            limit: 最大返回数量。

        Returns:
            按创建时间倒序排列的有效记录。
        """
        await self._initialize()
        async with connect(self._database) as database:
            cursor = await database.execute(
                """
                SELECT payload
                FROM client_download_record
                ORDER BY created_at DESC
                LIMIT ?
                """,
                (limit,),
            )
            rows = await cursor.fetchall()
        result = []
        for (payload,) in rows:
            try:
                result.append(ClientDownloadRecord.model_validate_json(payload))
            except ValidationError as error:
                logger.warning("忽略无效的客户端下载记录：{}", error)
        return result

    async def _initialize(self) -> None:
        if self._initialized:
            return
        self._database.parent.mkdir(parents=True, exist_ok=True)
        async with connect(self._database) as database:
            await database.execute(
                """
                CREATE TABLE IF NOT EXISTS client_download_record (
                    record_id TEXT PRIMARY KEY,
                    payload TEXT NOT NULL,
                    created_at TEXT NOT NULL
                )
                """
            )
            await database.commit()
        self._initialized = True
