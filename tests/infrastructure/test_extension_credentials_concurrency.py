"""扩展凭据仓储并发迁移测试。"""

from asyncio import gather
from datetime import UTC, datetime

from aiosqlite import connect
from xhs_adapters.sqlite import SqliteExtensionCredentialRepository


async def test_extension_credentials_serialize_concurrent_migrations(
    tmp_path,
) -> None:
    """确保多个仓储实例并发启动时只执行一次旧表迁移。

    Args:
        tmp_path: pytest 提供的临时目录。
    """
    database = tmp_path.joinpath("state.db")
    registered_at = datetime.now(UTC)
    async with connect(database) as connection:
        await connection.execute(
            """
            CREATE TABLE publication_extension (
                extension_id TEXT PRIMARY KEY,
                token_hash TEXT NOT NULL,
                registered_at TEXT NOT NULL
            )
            """
        )
        await connection.execute(
            "INSERT INTO publication_extension VALUES (?, ?, ?)",
            ("legacy-extension", "synthetic-hash", registered_at.isoformat()),
        )
        await connection.commit()

    first = SqliteExtensionCredentialRepository(database)
    second = SqliteExtensionCredentialRepository(database)
    first_presence, second_presence = await gather(
        first.list_extensions(),
        second.list_extensions(),
    )

    assert first_presence[0].last_seen_at == registered_at
    assert second_presence[0].last_seen_at == registered_at
