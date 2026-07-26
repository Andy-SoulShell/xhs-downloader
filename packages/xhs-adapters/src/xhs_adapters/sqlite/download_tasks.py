"""SQLite 后台下载任务仓储。"""

from pathlib import Path

from loguru import logger
from pydantic import ValidationError
from xhs_core.domain.models import DownloadTask, DownloadTaskStatus

from .connection import connect


class SqliteTaskRepository:
    """在 SQLite 中持久化后台下载任务快照。

    Args:
        database: 与下载记录共用或独立使用的 SQLite 文件路径。
    """

    def __init__(self, database: Path) -> None:
        self._database = database
        self._initialized = False

    async def get(self, task_id: str) -> DownloadTask | None:
        """按任务 ID 读取任务。

        Args:
            task_id: 任务唯一标识。

        Returns:
            已验证的任务；不存在或记录损坏时返回 ``None``。
        """
        await self._initialize()
        return await self._fetch_one(
            "SELECT payload FROM download_task WHERE task_id = ?",
            (task_id,),
        )

    async def get_by_request_id(self, request_id: str) -> DownloadTask | None:
        """按客户端幂等标识读取任务。

        Args:
            request_id: 客户端请求标识。

        Returns:
            已验证的任务；不存在或记录损坏时返回 ``None``。
        """
        await self._initialize()
        return await self._fetch_one(
            "SELECT payload FROM download_task WHERE client_request_id = ?",
            (request_id,),
        )

    async def save(self, task: DownloadTask) -> None:
        """原子新增或覆盖任务快照。

        Args:
            task: 完整任务状态。
        """
        await self._initialize()
        async with connect(self._database) as database:
            await database.execute(
                """
                INSERT INTO download_task (
                    task_id, client_request_id, status, payload,
                    created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(task_id) DO UPDATE SET
                    client_request_id = excluded.client_request_id,
                    status = excluded.status,
                    payload = excluded.payload,
                    updated_at = excluded.updated_at
                """,
                (
                    task.task_id,
                    task.client_request_id,
                    task.status.value,
                    task.model_dump_json(),
                    task.created_at.isoformat(),
                    task.updated_at.isoformat(),
                ),
            )
            await database.commit()

    async def list_recent(
        self,
        limit: int,
        status: DownloadTaskStatus | None = None,
    ) -> list[DownloadTask]:
        """读取最近任务。

        Args:
            limit: 最大返回数量。
            status: 可选状态筛选。

        Returns:
            按更新时间倒序排列的有效任务。
        """
        await self._initialize()
        if status:
            query = (
                "SELECT payload FROM download_task "
                "WHERE status = ? ORDER BY updated_at DESC LIMIT ?"
            )
            parameters = (status.value, limit)
        else:
            query = "SELECT payload FROM download_task ORDER BY updated_at DESC LIMIT ?"
            parameters = (limit,)
        return await self._fetch_many(query, parameters)

    async def list_recoverable(self) -> list[DownloadTask]:
        """读取服务重启后应恢复的任务。

        Returns:
            按创建时间排列的排队中或执行中任务。
        """
        await self._initialize()
        return await self._fetch_many(
            """
            SELECT payload
            FROM download_task
            WHERE status IN (?, ?)
            ORDER BY created_at
            """,
            (DownloadTaskStatus.QUEUED.value, DownloadTaskStatus.RUNNING.value),
        )

    async def _fetch_one(
        self,
        query: str,
        parameters: tuple,
    ) -> DownloadTask | None:
        async with connect(self._database) as database:
            cursor = await database.execute(query, parameters)
            row = await cursor.fetchone()
        if not row:
            return None
        return self._validate(row[0])

    async def _fetch_many(
        self,
        query: str,
        parameters: tuple,
    ) -> list[DownloadTask]:
        async with connect(self._database) as database:
            cursor = await database.execute(query, parameters)
            rows = await cursor.fetchall()
        return [
            task for (payload,) in rows if (task := self._validate(payload)) is not None
        ]

    @staticmethod
    def _validate(payload: str) -> DownloadTask | None:
        try:
            return DownloadTask.model_validate_json(payload)
        except ValidationError as error:
            logger.warning("忽略无效的后台任务记录：{}", error)
            return None

    async def _initialize(self) -> None:
        if self._initialized:
            return
        self._database.parent.mkdir(parents=True, exist_ok=True)
        async with connect(self._database) as database:
            await database.execute(
                """
                CREATE TABLE IF NOT EXISTS download_task (
                    task_id TEXT PRIMARY KEY,
                    client_request_id TEXT UNIQUE,
                    status TEXT NOT NULL,
                    payload TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )
            await database.commit()
        self._initialized = True
