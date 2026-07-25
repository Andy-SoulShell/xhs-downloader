"""协调同一受管浏览器 Profile 的独占自动化操作。"""

import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager


class ManagedBrowserExecutionGate:
    """在单一进程内串行保护共享受管浏览器的页面与登录态。"""

    def __init__(self) -> None:
        """创建尚未被任务占用的公平异步闸门。"""
        self._lock = asyncio.Lock()

    @asynccontextmanager
    async def hold(self) -> AsyncIterator[None]:
        """独占受管浏览器直到当前自动化操作完成。

        Yields:
            调用方持有独占执行权期间的空上下文。
        """
        async with self._lock:
            yield
