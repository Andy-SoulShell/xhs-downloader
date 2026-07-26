"""SQLite 浏览器扩展能力凭据仓储。"""

from datetime import datetime
from pathlib import Path
from secrets import compare_digest

from xhs_core.domain import ExtensionPresence

from .connection import connect


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
                    extension_id, token_hash, registered_at, last_seen_at
                ) VALUES (?, ?, ?, ?)
                ON CONFLICT(extension_id) DO UPDATE SET
                    token_hash = excluded.token_hash,
                    registered_at = excluded.registered_at,
                    last_seen_at = excluded.last_seen_at
                """,
                (
                    extension_id,
                    token_hash,
                    registered_at.isoformat(),
                    registered_at.isoformat(),
                ),
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

    async def touch_extension(
        self,
        extension_id: str,
        seen_at: datetime,
    ) -> None:
        """更新扩展最近一次通过认证的时间。

        Args:
            extension_id: 浏览器扩展 ID。
            seen_at: 本次认证成功时间。
        """
        await self._initialize()
        async with connect(self._database) as database:
            await database.execute(
                """
                UPDATE publication_extension
                SET last_seen_at = ?
                WHERE extension_id = ?
                """,
                (seen_at.isoformat(), extension_id),
            )
            await database.commit()

    async def list_extensions(self) -> list[ExtensionPresence]:
        """列出扩展登记与最近认证时间。

        Returns:
            按最近认证时间倒序排列的扩展状态。
        """
        await self._initialize()
        async with connect(self._database) as database:
            cursor = await database.execute(
                """
                SELECT extension_id, registered_at, last_seen_at
                FROM publication_extension
                ORDER BY last_seen_at DESC
                """
            )
            rows = await cursor.fetchall()
        return [
            ExtensionPresence(
                extension_id=row[0],
                registered_at=datetime.fromisoformat(row[1]),
                last_seen_at=datetime.fromisoformat(row[2]),
            )
            for row in rows
        ]

    async def revoke_extension(self, extension_id: str) -> bool:
        """删除扩展登记，使其令牌立即失效。

        Args:
            extension_id: 浏览器扩展 ID。

        Returns:
            存在并成功删除登记时返回真。
        """
        await self._initialize()
        async with connect(self._database) as database:
            cursor = await database.execute(
                """
                DELETE FROM publication_extension
                WHERE extension_id = ?
                """,
                (extension_id,),
            )
            await database.commit()
        return cursor.rowcount > 0

    async def _initialize(self) -> None:
        if self._initialized:
            return
        self._database.parent.mkdir(parents=True, exist_ok=True)
        async with connect(self._database) as database:
            await database.execute("BEGIN IMMEDIATE")
            await database.execute(
                """
                CREATE TABLE IF NOT EXISTS publication_extension (
                    extension_id TEXT PRIMARY KEY,
                    token_hash TEXT NOT NULL,
                    registered_at TEXT NOT NULL,
                    last_seen_at TEXT NOT NULL
                )
                """
            )
            columns = {
                row[1]
                for row in await (
                    await database.execute("PRAGMA table_info(publication_extension)")
                ).fetchall()
            }
            if "last_seen_at" not in columns:
                await database.execute(
                    """
                    ALTER TABLE publication_extension
                    ADD COLUMN last_seen_at TEXT
                    """
                )
                await database.execute(
                    """
                    UPDATE publication_extension
                    SET last_seen_at = registered_at
                    WHERE last_seen_at IS NULL
                    """
                )
            await database.commit()
        self._initialized = True
