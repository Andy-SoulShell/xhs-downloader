"""SQLite 采集帖子仓储。"""

from datetime import UTC, datetime
from pathlib import Path

from aiosqlite import connect
from loguru import logger
from pydantic import ValidationError
from xhs_core.domain.models import WorkDetail


class SqlitePostRepository:
    """持久化已经解析的帖子详情，供工作台跨会话恢复。

    Args:
        database: 与下载记录共用或独立使用的 SQLite 文件路径。
    """

    def __init__(self, database: Path) -> None:
        self._database = database
        self._initialized = False

    async def save(self, detail: WorkDetail) -> None:
        """幂等保存作品的最新详情。

        Args:
            detail: 已经完成类型验证的作品详情。
        """
        await self._initialize()
        async with connect(self._database) as database:
            await database.execute(
                """
                INSERT INTO collected_post (work_id, payload, collected_at)
                VALUES (?, ?, ?)
                ON CONFLICT(work_id) DO UPDATE SET
                    payload = excluded.payload,
                    collected_at = excluded.collected_at
                """,
                (
                    detail.work_id,
                    detail.model_dump_json(),
                    datetime.now(UTC).isoformat(),
                ),
            )
            await database.commit()

    async def list_recent(self, limit: int) -> list[WorkDetail]:
        """读取最近采集的有效帖子。

        Args:
            limit: 最大返回数量。

        Returns:
            按采集时间倒序排列的作品详情。
        """
        await self._initialize()
        async with connect(self._database) as database:
            cursor = await database.execute(
                """
                SELECT payload
                FROM collected_post
                ORDER BY collected_at DESC
                LIMIT ?
                """,
                (limit,),
            )
            rows = await cursor.fetchall()
        result = []
        for (payload,) in rows:
            try:
                result.append(WorkDetail.model_validate_json(payload))
            except ValidationError as error:
                logger.warning("忽略无效的采集帖子记录：{}", error)
        return result

    async def delete(self, work_id: str) -> None:
        """删除一个采集帖子。

        Args:
            work_id: 作品 ID。
        """
        await self._initialize()
        async with connect(self._database) as database:
            await database.execute(
                "DELETE FROM collected_post WHERE work_id = ?",
                (work_id,),
            )
            await database.commit()

    async def _initialize(self) -> None:
        if self._initialized:
            return
        self._database.parent.mkdir(parents=True, exist_ok=True)
        async with connect(self._database) as database:
            await database.execute(
                """
                CREATE TABLE IF NOT EXISTS collected_post (
                    work_id TEXT PRIMARY KEY,
                    payload TEXT NOT NULL,
                    collected_at TEXT NOT NULL
                )
                """
            )
            await database.commit()
        self._initialized = True
