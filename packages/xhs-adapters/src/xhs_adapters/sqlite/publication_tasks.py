"""SQLite 发布任务与租约仓储。"""

from datetime import datetime
from pathlib import Path
from secrets import compare_digest

from aiosqlite import connect
from xhs_core.domain import BrowserDriver, PublicationTask, PublicationTaskStatus

from .publication_task_storage import (
    initialize_publication_task_storage,
    parse_publication_task,
    publication_claim_query,
    save_publication_task_if_snapshot,
)

_TERMINAL = {
    PublicationTaskStatus.PUBLISHED,
    PublicationTaskStatus.NEEDS_REVIEW,
    PublicationTaskStatus.FAILED,
    PublicationTaskStatus.CANCELED,
}


class SqlitePublicationTaskRepository:
    """在 SQLite 中持久化发布任务和短期租约。

    Args:
        database: 状态数据库路径。
    """

    def __init__(self, database: Path) -> None:
        self._database = database
        self._initialized = False

    async def save_task(self, task: PublicationTask) -> None:
        """保存发布任务并保留现有租约摘要。

        Args:
            task: 完整任务快照。
        """
        await self._initialize()
        async with connect(self._database) as database:
            await database.execute(
                """
                INSERT INTO publication_task (
                    task_id, draft_id, mode, target_driver, status,
                    scheduled_at, payload, lease_hash, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
                ON CONFLICT(task_id) DO UPDATE SET
                    mode = excluded.mode,
                    target_driver = excluded.target_driver,
                    status = excluded.status,
                    scheduled_at = excluded.scheduled_at,
                    payload = excluded.payload,
                    updated_at = excluded.updated_at
                """,
                (
                    task.task_id,
                    task.package.draft_id,
                    task.mode.value,
                    task.target_driver.value,
                    task.status.value,
                    task.scheduled_at.isoformat(),
                    task.model_dump_json(),
                    task.created_at.isoformat(),
                    task.updated_at.isoformat(),
                ),
            )
            await database.commit()

    async def get_task(self, task_id: str) -> PublicationTask | None:
        """读取发布任务。

        Args:
            task_id: 任务唯一标识。

        Returns:
            已验证任务；不存在时返回 ``None``。
        """
        await self._initialize()
        tasks = await self._fetch(
            "SELECT payload FROM publication_task WHERE task_id = ?",
            (task_id,),
        )
        return tasks[0] if tasks else None

    async def save_task_if_status(
        self,
        task: PublicationTask,
        expected: PublicationTaskStatus,
        expected_updated_at: datetime | None = None,
        clear_lease: bool = False,
    ) -> bool:
        """按预期状态和可选版本时间原子更新任务。

        Args:
            task: 新任务快照。
            expected: 数据库中必须匹配的旧状态。
            expected_updated_at: 可选的旧快照更新时间。
            clear_lease: 是否在同一原子更新中清除旧租约。

        Returns:
            状态及指定版本匹配并成功更新一条记录时返回真。
        """
        await self._initialize()
        return await save_publication_task_if_snapshot(
            self._database,
            task,
            expected,
            expected_updated_at,
            clear_lease,
        )

    async def list_tasks(self, limit: int) -> list[PublicationTask]:
        """列出最近发布任务。

        Args:
            limit: 最大返回数量。

        Returns:
            按更新时间倒序排列的有效任务。
        """
        await self._initialize()
        return await self._fetch(
            """
            SELECT payload FROM publication_task
            ORDER BY updated_at DESC LIMIT ?
            """,
            (limit,),
        )

    async def list_active_tasks(self) -> list[PublicationTask]:
        """读取尚未终结的任务。

        Returns:
            按计划时间排列的活跃任务。
        """
        await self._initialize()
        placeholders = ",".join("?" for _ in _TERMINAL)
        return await self._fetch(
            f"""
            SELECT payload FROM publication_task
            WHERE status NOT IN ({placeholders})
            ORDER BY scheduled_at
            """,
            tuple(status.value for status in _TERMINAL),
        )

    async def claim_ready(
        self,
        executor_id: str,
        now: datetime,
        lease_expires_at: datetime,
        lease_hash: str,
        preferred_task_id: str | None,
        target_driver: BrowserDriver = BrowserDriver.EXTENSION,
    ) -> PublicationTask | None:
        """原子领取一个已就绪任务。

        Args:
            executor_id: 扩展或受管 Worker 实例标识。
            now: 领取时间。
            lease_expires_at: 租约到期时间。
            lease_hash: 租约凭据摘要。
            preferred_task_id: 手动发布指定的任务。
            target_driver: 只领取该驱动的就绪任务。

        Returns:
            已领取任务；没有任务时返回 ``None``。
        """
        await self._initialize()
        async with connect(self._database) as database:
            await database.execute("BEGIN IMMEDIATE")
            query, parameters = publication_claim_query(
                preferred_task_id,
                target_driver,
            )
            cursor = await database.execute(query, parameters)
            row = await cursor.fetchone()
            task = parse_publication_task(row[0]) if row else None
            if not task:
                await database.rollback()
                return None
            claimed = task.model_copy(
                update={
                    "status": PublicationTaskStatus.CLAIMED,
                    "executor_id": executor_id,
                    "extension_id": executor_id
                    if target_driver is BrowserDriver.EXTENSION
                    else None,
                    "lease_expires_at": lease_expires_at,
                    "attempts": task.attempts + 1,
                    "message": "扩展已领取任务"
                    if target_driver is BrowserDriver.EXTENSION
                    else "受管浏览器已领取任务",
                    "updated_at": now,
                }
            )
            cursor = await database.execute(
                """
                UPDATE publication_task SET
                    status = ?, payload = ?, lease_hash = ?, updated_at = ?
                WHERE task_id = ? AND status = ?
                """,
                (
                    claimed.status.value,
                    claimed.model_dump_json(),
                    lease_hash,
                    now.isoformat(),
                    claimed.task_id,
                    PublicationTaskStatus.READY.value,
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
            lease_hash: 请求凭据摘要。

        Returns:
            摘要一致时返回真。
        """
        await self._initialize()
        async with connect(self._database) as database:
            cursor = await database.execute(
                "SELECT lease_hash FROM publication_task WHERE task_id = ?",
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
                "UPDATE publication_task SET lease_hash = NULL WHERE task_id = ?",
                (task_id,),
            )
            await database.commit()

    async def has_active_task(self, draft_id: str) -> bool:
        """判断草稿是否被活跃任务引用。

        Args:
            draft_id: 草稿唯一标识。

        Returns:
            存在活跃任务时返回真。
        """
        await self._initialize()
        placeholders = ",".join("?" for _ in _TERMINAL)
        async with connect(self._database) as database:
            cursor = await database.execute(
                f"""
                SELECT 1 FROM publication_task
                WHERE draft_id = ? AND status NOT IN ({placeholders})
                LIMIT 1
                """,
                (draft_id, *(status.value for status in _TERMINAL)),
            )
            return await cursor.fetchone() is not None

    async def _fetch(
        self,
        query: str,
        parameters: tuple,
    ) -> list[PublicationTask]:
        async with connect(self._database) as database:
            cursor = await database.execute(query, parameters)
            rows = await cursor.fetchall()
        return [
            task
            for (payload,) in rows
            if (task := parse_publication_task(payload)) is not None
        ]

    async def _initialize(self) -> None:
        if self._initialized:
            return
        await initialize_publication_task_storage(self._database)
        self._initialized = True
