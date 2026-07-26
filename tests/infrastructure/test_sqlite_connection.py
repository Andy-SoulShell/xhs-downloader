"""SQLite 共享连接工厂并发配置测试。"""

from pathlib import Path

import aiosqlite
from xhs_adapters.sqlite import connection as connection_module
from xhs_adapters.sqlite.connection import connect


async def test_connection_enables_wal_and_busy_timeout(tmp_path: Path) -> None:
    """确保共享连接启用 WAL 日志并显式设置忙等待。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    database = tmp_path.joinpath("state.db")

    async with connect(database) as connection:
        journal = await (await connection.execute("PRAGMA journal_mode")).fetchone()
        busy = await (await connection.execute("PRAGMA busy_timeout")).fetchone()

    assert journal is not None and journal[0] == "wal"
    assert busy is not None and busy[0] == 5_000


async def test_wal_mode_persists_without_repeating_pragma(tmp_path: Path) -> None:
    """确保 WAL 每个进程只设置一次，重开数据库仍保持该模式。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    database = tmp_path.joinpath("state.db")

    async with connect(database) as connection:
        await connection.execute("CREATE TABLE demo (value TEXT)")
        await connection.execute("INSERT INTO demo VALUES ('合成数据')")
        await connection.commit()

    assert str(database) in connection_module._journal_configured
    # 清空进程缓存后仍应为 WAL: 该模式已持久写入数据库文件。
    connection_module._journal_configured.discard(str(database))

    async with connect(database) as connection:
        journal = await (await connection.execute("PRAGMA journal_mode")).fetchone()
        row = await (await connection.execute("SELECT value FROM demo")).fetchone()

    assert journal is not None and journal[0] == "wal"
    assert row is not None and row[0] == "合成数据"


async def test_busy_journal_switch_degrades_without_failing(tmp_path: Path) -> None:
    """确保切换日志模式拿不到独占锁时连接仍可用，并留待后续再试。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    database = tmp_path.joinpath("state.db")
    # 绕过共享工厂建库: 数据库保持回滚日志模式时切换 WAL 才需要独占锁。
    async with aiosqlite.connect(database) as holder:
        await holder.execute("CREATE TABLE demo (value TEXT)")
        await holder.commit()
        await holder.execute("BEGIN IMMEDIATE")
        await holder.execute("INSERT INTO demo VALUES ('占位')")

        async with connect(database) as blocked:
            journal = await (await blocked.execute("PRAGMA journal_mode")).fetchone()

        await holder.rollback()

    assert journal is not None and journal[0] == "delete"
    assert str(database) not in connection_module._journal_configured

    async with connect(database) as retried:
        journal = await (await retried.execute("PRAGMA journal_mode")).fetchone()

    assert journal is not None and journal[0] == "wal"
