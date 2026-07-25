"""浏览器任务应用服务依赖的仓储端口。"""

from datetime import datetime
from typing import Protocol

from .browser_tasks import BrowserTask, BrowserTaskStatus


class BrowserTaskRepository(Protocol):
    """通用浏览器任务与租约仓储端口。"""

    async def save(self, task: BrowserTask) -> None:
        """保存完整任务快照。

        Args:
            task: 浏览器任务。
        """
        ...

    async def get(self, task_id: str) -> BrowserTask | None:
        """按任务标识读取任务。

        Args:
            task_id: 任务唯一标识。

        Returns:
            已有任务；不存在时返回 ``None``。
        """
        ...

    async def get_by_request_id(self, request_id: str) -> BrowserTask | None:
        """按幂等请求标识读取任务。

        Args:
            request_id: 调用方请求标识。

        Returns:
            已有任务；不存在时返回 ``None``。
        """
        ...

    async def list_recent(self, limit: int) -> list[BrowserTask]:
        """列出最近任务。

        Args:
            limit: 最大返回数量。

        Returns:
            按更新时间倒序排列的任务。
        """
        ...

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
        ...

    async def claim_next(
        self,
        extension_id: str,
        now: datetime,
        lease_expires_at: datetime,
        lease_hash: str,
    ) -> BrowserTask | None:
        """原子领取最早排队任务。

        Args:
            extension_id: 扩展实例标识。
            now: 领取时间。
            lease_expires_at: 租约到期时间。
            lease_hash: 不可逆租约摘要。

        Returns:
            已领取任务；队列为空时返回 ``None``。
        """
        ...

    async def validate_lease(self, task_id: str, lease_hash: str) -> bool:
        """校验任务租约摘要。

        Args:
            task_id: 任务唯一标识。
            lease_hash: 请求携带的租约摘要。

        Returns:
            摘要与当前租约一致时返回真。
        """
        ...

    async def clear_lease(self, task_id: str) -> None:
        """清除任务租约。

        Args:
            task_id: 任务唯一标识。
        """
        ...

    async def list_expired(self, now: datetime) -> list[BrowserTask]:
        """列出租约已经过期的执行中任务。

        Args:
            now: 当前时间。

        Returns:
            按更新时间排列的过期任务。
        """
        ...
