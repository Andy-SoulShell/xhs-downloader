"""浏览器任务领取的低延迟有界等待机制。"""

import asyncio
from collections.abc import Awaitable, Callable

from xhs_core.domain import BrowserTaskError

_MAX_WAIT_SECONDS = 30
_DEFAULT_RECHECK_SECONDS = 1.0

type _ClaimOperation[ClaimT] = Callable[[], Awaitable[ClaimT | None]]


class _BrowserTaskClaimWaiter:
    """用一次性事件唤醒领取方，并以周期检查覆盖进程外提交。"""

    def __init__(self) -> None:
        self._changed = asyncio.Event()

    def notify(self) -> None:
        """唤醒当前等待者，并为后续提交切换到新的事件。"""
        previous = self._changed
        self._changed = asyncio.Event()
        previous.set()

    async def wait_for_claim[ClaimT](
        self,
        operation: _ClaimOperation[ClaimT],
        wait_seconds: float,
        recheck_seconds: float = _DEFAULT_RECHECK_SECONDS,
    ) -> ClaimT | None:
        """等待任务出现并执行原子领取。

        Args:
            operation: 每次检查时调用的原子领取操作。
            wait_seconds: 最长等待秒数，必须在零到三十秒之间。
            recheck_seconds: 即使没有进程内通知也会执行的检查间隔。

        Returns:
            已领取任务；等待超时且仍无任务时返回 ``None``。

        Raises:
            BrowserTaskError: 等待时间或周期检查间隔无效。
        """
        if not 0 <= wait_seconds <= _MAX_WAIT_SECONDS or recheck_seconds <= 0:
            raise BrowserTaskError("浏览器任务领取等待参数无效")
        loop = asyncio.get_running_loop()
        deadline = loop.time() + wait_seconds
        while True:
            changed = self._changed
            claim = await operation()
            if claim is not None:
                return claim
            remaining = deadline - loop.time()
            if remaining <= 0:
                return None
            try:
                async with asyncio.timeout(min(remaining, recheck_seconds)):
                    await changed.wait()
            except TimeoutError:
                continue
