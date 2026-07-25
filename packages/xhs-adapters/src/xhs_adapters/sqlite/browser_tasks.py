"""SQLite 通用浏览器任务与租约仓储。"""

from datetime import datetime
from pathlib import Path
from secrets import compare_digest

from aiosqlite import connect
from xhs_core.domain import BrowserDriver, BrowserTask, BrowserTaskStatus

from .browser_task_storage import (
    browser_task_parameters,
    first_queued_browser_task,
    initialize_browser_task_storage,
    parse_browser_task,
)


class SqliteBrowserTaskRepository:
    """在 SQLite 中持久化浏览器任务和短期租约。

    Args:
        database: 状态数据库路径。
    """

    def __init__(self, database: Path) -> None:
        self._database = database
        self._initialized = False

    async def save(self, task: BrowserTask) -> None:
        """保存任务并保留已有租约摘要。

        Args:
            task: 完整任务快照。
        """
        await self._initialize()
        async with connect(self._database) as database:
            await database.execute(
                """
                INSERT INTO browser_task (
                    task_id, request_id, kind, target_driver, status, payload,
                    lease_hash, lease_expires_at, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)
                ON CONFLICT(task_id) DO UPDATE SET
                    request_id = excluded.request_id,
                    kind = excluded.kind,
                    target_driver = excluded.target_driver,
                    status = excluded.status,
                    payload = excluded.payload,
                    lease_expires_at = excluded.lease_expires_at,
                    updated_at = excluded.updated_at
                """,
                browser_task_parameters(task),
            )
            await database.commit()

    async def get(self, task_id: str) -> BrowserTask | None:
        """按任务标识读取任务。

        Args:
            task_id: 任务唯一标识。

        Returns:
            已验证任务；不存在或记录损坏时返回 ``None``。
        """
        await self._initialize()
        tasks = await self._fetch(
            "SELECT payload FROM browser_task WHERE task_id = ?",
            (task_id,),
        )
        return tasks[0] if tasks else None

    async def get_by_request_id(self, request_id: str) -> BrowserTask | None:
        """按幂等请求标识读取任务。

        Args:
            request_id: 调用方请求标识。

        Returns:
            已验证任务；不存在或记录损坏时返回 ``None``。
        """
        await self._initialize()
        tasks = await self._fetch(
            "SELECT payload FROM browser_task WHERE request_id = ?",
            (request_id,),
        )
        return tasks[0] if tasks else None

    async def list_recent(self, limit: int) -> list[BrowserTask]:
        """列出最近浏览器任务。

        Args:
            limit: 最大返回数量。

        Returns:
            按更新时间倒序排列的有效任务。
        """
        await self._initialize()
        return await self._fetch(
            """
            SELECT payload FROM browser_task
            ORDER BY updated_at DESC LIMIT ?
            """,
            (limit,),
        )

    async def save_if_status(
        self,
        task: BrowserTask,
        expected: BrowserTaskStatus,
    ) -> bool:
        """按预期状态原子更新任务。

        Args:
            task: 新任务快照。
            expected: 数据库中必须匹配的旧状态。

        Returns:
            成功更新一条记录时返回真。
        """
        await self._initialize()
        async with connect(self._database) as database:
            cursor = await database.execute(
                """
                UPDATE browser_task SET
                    status = ?, payload = ?, lease_expires_at = ?, updated_at = ?
                WHERE task_id = ? AND status = ?
                """,
                (
                    task.status.value,
                    task.model_dump_json(),
                    (
                        task.lease_expires_at.isoformat()
                        if task.lease_expires_at
                        else None
                    ),
                    task.updated_at.isoformat(),
                    task.task_id,
                    expected.value,
                ),
            )
            await database.commit()
        return cursor.rowcount == 1

    async def claim_next(
        self,
        executor_id: str,
        now: datetime,
        lease_expires_at: datetime,
        lease_hash: str,
        target_driver: BrowserDriver = BrowserDriver.EXTENSION,
    ) -> BrowserTask | None:
        """原子领取最早排队任务。

        Args:
            executor_id: 扩展或受管 Worker 实例标识。
            now: 领取时间。
            lease_expires_at: 租约到期时间。
            lease_hash: 不可逆租约摘要。
            target_driver: 只领取该驱动的任务。

        Returns:
            已领取任务；队列为空时返回 ``None``。
        """
        await self._initialize()
        async with connect(self._database) as database:
            await database.execute("BEGIN IMMEDIATE")
            task = await first_queued_browser_task(database, target_driver)
            if not task:
                await database.rollback()
                return None
            claimed = task.model_copy(
                update={
                    "status": BrowserTaskStatus.CLAIMED,
                    "executor_id": executor_id,
                    "extension_id": (
                        executor_id
                        if target_driver is BrowserDriver.EXTENSION
                        else None
                    ),
                    "lease_expires_at": lease_expires_at,
                    "attempts": task.attempts + 1,
                    "message": (
                        "浏览器扩展已领取任务"
                        if target_driver is BrowserDriver.EXTENSION
                        else "受管浏览器已领取任务"
                    ),
                    "updated_at": now,
                }
            )
            cursor = await database.execute(
                """
                UPDATE browser_task SET
                    status = ?, payload = ?, lease_hash = ?,
                    lease_expires_at = ?, updated_at = ?
                WHERE task_id = ? AND status = ? AND target_driver = ?
                """,
                (
                    claimed.status.value,
                    claimed.model_dump_json(),
                    lease_hash,
                    lease_expires_at.isoformat(),
                    now.isoformat(),
                    claimed.task_id,
                    BrowserTaskStatus.QUEUED.value,
                    target_driver.value,
                ),
            )
            if cursor.rowcount != 1:
                await database.rollback()
                return None
            await database.commit()
            return claimed

    async def validate_lease(self, task_id: str, lease_hash: str) -> bool:
        """校验任务租约摘要。

        Args:
            task_id: 任务唯一标识。
            lease_hash: 请求携带的租约摘要。

        Returns:
            摘要一致时返回真。
        """
        await self._initialize()
        async with connect(self._database) as database:
            cursor = await database.execute(
                "SELECT lease_hash FROM browser_task WHERE task_id = ?",
                (task_id,),
            )
            row = await cursor.fetchone()
        return bool(row and row[0] and compare_digest(row[0], lease_hash))

    async def clear_lease(self, task_id: str) -> None:
        """清除任务租约。

        Args:
            task_id: 任务唯一标识。
        """
        await self._initialize()
        async with connect(self._database) as database:
            await database.execute(
                """
                UPDATE browser_task
                SET lease_hash = NULL, lease_expires_at = NULL
                WHERE task_id = ?
                """,
                (task_id,),
            )
            await database.commit()

    async def list_expired(self, now: datetime) -> list[BrowserTask]:
        """列出租约已经过期的执行中任务。

        Args:
            now: 当前时间。

        Returns:
            按更新时间排列的过期任务。
        """
        await self._initialize()
        return await self._fetch(
            """
            SELECT payload FROM browser_task
            WHERE status IN (?, ?) AND lease_expires_at <= ?
            ORDER BY updated_at
            """,
            (
                BrowserTaskStatus.CLAIMED.value,
                BrowserTaskStatus.RUNNING.value,
                now.isoformat(),
            ),
        )

    async def _fetch(self, query: str, parameters: tuple) -> list[BrowserTask]:
        async with connect(self._database) as database:
            cursor = await database.execute(query, parameters)
            rows = await cursor.fetchall()
        return [
            task
            for (payload,) in rows
            if (task := parse_browser_task(payload)) is not None
        ]

    async def _initialize(self) -> None:
        if self._initialized:
            return
        await initialize_browser_task_storage(self._database)
        self._initialized = True
