"""SQLite 连接工厂，统一并发日志模式与忙等待配置。"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from sqlite3 import OperationalError

from aiosqlite import Connection
from aiosqlite import connect as _connect

_BUSY_TIMEOUT_MILLISECONDS = 5_000
_JOURNAL_SWITCH_TIMEOUT_MILLISECONDS = 50
_journal_configured: set[str] = set()


@asynccontextmanager
async def connect(database: Path) -> AsyncIterator[Connection]:
    """打开启用 WAL 与忙等待的 SQLite 连接。

    所有仓储共享同一个状态数据库。WAL 允许读写并发，显式忙等待让领取
    路径的 ``BEGIN IMMEDIATE`` 在锁竞争时等待而不是立即失败。

    忙等待是连接级配置，每次连接都要设置；WAL 会写入数据库文件，因此
    每个进程只在首次连接该文件时设置一次。切换日志模式需要独占锁，为避免
    其他连接活跃时长时间阻塞，切换只用很短的忙等待，失败即保持回滚日志
    模式并留待后续空闲连接再次尝试，不影响本次读写。

    Args:
        database: 状态数据库路径。

    Yields:
        已应用并发配置的数据库连接，随上下文退出自动关闭。
    """
    key = str(database)
    async with _connect(database) as connection:
        if key not in _journal_configured:
            await _try_enable_write_ahead_log(connection, key)
        await connection.execute(f"PRAGMA busy_timeout = {_BUSY_TIMEOUT_MILLISECONDS}")
        yield connection


async def _try_enable_write_ahead_log(connection: Connection, key: str) -> None:
    await connection.execute(
        f"PRAGMA busy_timeout = {_JOURNAL_SWITCH_TIMEOUT_MILLISECONDS}"
    )
    try:
        await connection.execute("PRAGMA journal_mode = WAL")
    except OperationalError:
        return
    _journal_configured.add(key)
