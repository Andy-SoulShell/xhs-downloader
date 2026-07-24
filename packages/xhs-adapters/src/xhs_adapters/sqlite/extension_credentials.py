"""SQLite 浏览器扩展能力凭据仓储。"""

from datetime import datetime
from pathlib import Path
from secrets import compare_digest

from aiosqlite import connect


class SqliteExtensionCredentialRepository:
    """保存不含账号凭据的本机扩展能力令牌。

    Args:
        database: 状态数据库路径。
    """

    def __init__(self, database: Path) -> None:
        self._database = database
        self._initialized = False

    async def register_extension(
        self,
        extension_id: str,
        token_hash: str,
        registered_at: datetime,
    ) -> None:
        """登记扩展能力令牌。

        Args:
            extension_id: 浏览器扩展 ID。
            token_hash: 能力令牌摘要。
            registered_at: 登记时间。
        """
        await self._initialize()
        async with connect(self._database) as database:
            await database.execute(
                """
                INSERT INTO publication_extension (
                    extension_id, token_hash, registered_at
                ) VALUES (?, ?, ?)
                ON CONFLICT(extension_id) DO UPDATE SET
                    token_hash = excluded.token_hash,
                    registered_at = excluded.registered_at
                """,
                (extension_id, token_hash, registered_at.isoformat()),
            )
            await database.commit()

    async def validate_extension(
        self,
        extension_id: str,
        token_hash: str,
    ) -> bool:
        """校验扩展能力令牌。

        Args:
            extension_id: 浏览器扩展 ID。
            token_hash: 能力令牌摘要。

        Returns:
            摘要与登记记录一致时返回真。
        """
        await self._initialize()
        async with connect(self._database) as database:
            cursor = await database.execute(
                """
                SELECT token_hash FROM publication_extension
                WHERE extension_id = ?
                """,
                (extension_id,),
            )
            row = await cursor.fetchone()
        return bool(row and compare_digest(row[0], token_hash))

    async def _initialize(self) -> None:
        if self._initialized:
            return
        self._database.parent.mkdir(parents=True, exist_ok=True)
        async with connect(self._database) as database:
            await database.execute(
                """
                CREATE TABLE IF NOT EXISTS publication_extension (
                    extension_id TEXT PRIMARY KEY,
                    token_hash TEXT NOT NULL,
                    registered_at TEXT NOT NULL
                )
                """
            )
            await database.commit()
        self._initialized = True
