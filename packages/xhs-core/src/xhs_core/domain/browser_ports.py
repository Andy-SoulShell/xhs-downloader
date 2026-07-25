"""浏览器任务应用服务依赖的仓储端口。"""

from datetime import datetime
from typing import Protocol

from .browser_tasks import (
    BrowserDriver,
    BrowserTask,
    BrowserTaskExecutionResult,
    BrowserTaskStatus,
)
from .managed_browser import ManagedBrowserStatus


class ManagedBrowserController(Protocol):
    """受管浏览器进程生命周期端口。"""

    async def status(self) -> ManagedBrowserStatus:
        """读取安装与运行状态。

        Returns:
            不包含完整路径或浏览数据的状态快照。
        """
        ...

    async def start(self) -> ManagedBrowserStatus:
        """启动或复用当前受管浏览器。

        Returns:
            已进入运行态的状态快照。
        """
        ...

    async def stop(self) -> ManagedBrowserStatus:
        """安全停止当前服务持有的受管浏览器。

        Returns:
            已进入停止态的状态快照。
        """
        ...

    async def close(self) -> None:
        """释放进程、端口和单实例锁。"""
        ...


class BrowserTaskExecutor(Protocol):
    """在已连接的浏览器页面中执行一个受管任务。"""

    async def execute(self, task: BrowserTask) -> BrowserTaskExecutionResult:
        """执行任务并返回可验证的明确终态。

        Args:
            task: 已进入运行态且固定为受管驱动的任务。

        Returns:
            成功、明确失败或需要人工核对的结构化结论。
        """
        ...

    async def close(self) -> None:
        """关闭页面连接并释放执行器资源。"""
        ...


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
