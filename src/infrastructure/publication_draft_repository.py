"""SQLite 发布草稿仓储。"""

from pathlib import Path

from aiosqlite import connect
from loguru import logger
from pydantic import ValidationError

from src.domain import PublicationDraft


class SqlitePublicationDraftRepository:
    """在 SQLite 中持久化发布草稿。

    Args:
        database: 状态数据库路径。
    """

    def __init__(self, database: Path) -> None:
        self._database = database
        self._initialized = False

    async def save_draft(self, draft: PublicationDraft) -> None:
        """保存草稿。

        Args:
            draft: 完整草稿快照。
        """
        await self._initialize()
        async with connect(self._database) as database:
            await database.execute(
                """
                INSERT INTO publication_draft (
                    draft_id, payload, created_at, updated_at
                ) VALUES (?, ?, ?, ?)
                ON CONFLICT(draft_id) DO UPDATE SET
                    payload = excluded.payload,
                    updated_at = excluded.updated_at
                """,
                (
                    draft.draft_id,
                    draft.model_dump_json(),
                    draft.created_at.isoformat(),
                    draft.updated_at.isoformat(),
                ),
            )
            await database.commit()

    async def get_draft(self, draft_id: str) -> PublicationDraft | None:
        """读取草稿。

        Args:
            draft_id: 草稿唯一标识。

        Returns:
            已验证草稿；不存在时返回 ``None``。
        """
        await self._initialize()
        async with connect(self._database) as database:
            cursor = await database.execute(
                "SELECT payload FROM publication_draft WHERE draft_id = ?",
                (draft_id,),
            )
            row = await cursor.fetchone()
        return self._validate(row[0]) if row else None

    async def list_drafts(self, limit: int) -> list[PublicationDraft]:
        """列出最近草稿。

        Args:
            limit: 最大返回数量。

        Returns:
            按更新时间倒序排列的有效草稿。
        """
        await self._initialize()
        async with connect(self._database) as database:
            cursor = await database.execute(
                """
                SELECT payload FROM publication_draft
                ORDER BY updated_at DESC LIMIT ?
                """,
                (limit,),
            )
            rows = await cursor.fetchall()
        return [
            draft
            for (payload,) in rows
            if (draft := self._validate(payload)) is not None
        ]

    async def delete_draft(self, draft_id: str) -> None:
        """删除草稿记录。

        Args:
            draft_id: 草稿唯一标识。
        """
        await self._initialize()
        async with connect(self._database) as database:
            await database.execute(
                "DELETE FROM publication_draft WHERE draft_id = ?",
                (draft_id,),
            )
            await database.commit()

    @staticmethod
    def _validate(payload: str) -> PublicationDraft | None:
        try:
            return PublicationDraft.model_validate_json(payload)
        except ValidationError as error:
            logger.warning("忽略无效发布草稿：{}", error)
            return None

    async def _initialize(self) -> None:
        if self._initialized:
            return
        self._database.parent.mkdir(parents=True, exist_ok=True)
        async with connect(self._database) as database:
            await database.execute(
                """
                CREATE TABLE IF NOT EXISTS publication_draft (
                    draft_id TEXT PRIMARY KEY,
                    payload TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )
            await database.commit()
        self._initialized = True
