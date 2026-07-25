"""支持排空请求后热切换的异步客户端槽。"""

import asyncio
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
from typing import Protocol


class AsyncCloseable(Protocol):
    """可由原子客户端槽管理生命周期的异步客户端。"""

    async def close(self) -> None:
        """释放客户端持有的连接与后台资源。"""


class AtomicClientSlotClosedError(RuntimeError):
    """客户端槽关闭后收到新租用或替换请求。"""


type AsyncClientFactory[ClientT: AsyncCloseable] = Callable[[], Awaitable[ClientT]]


class AtomicClientSlot[ClientT: AsyncCloseable]:
    """在请求边界安全租用、替换和关闭异步客户端。

    替换会先关闭租用闸门，等待旧客户端的所有租用结束，再构造并一次性
    安装新客户端。切换后先恢复新租用，再关闭已经不可见的旧客户端。
    替换与关闭操作通过维护锁串行，构造失败或提交前取消会重新开放旧
    客户端。提交后的取消则延迟到旧客户端关闭完成，避免资源泄漏。

    Args:
        client: 首个可供租用的客户端。

    Attributes:
        closed: 客户端槽是否已经提交关闭。
    """

    def __init__(self, client: ClientT) -> None:
        self._client: ClientT | None = client
        self._accepting = asyncio.Event()
        self._accepting.set()
        self._drained = asyncio.Event()
        self._drained.set()
        self._maintenance_lock = asyncio.Lock()
        self._active_leases = 0
        self._closed = False

    @property
    def closed(self) -> bool:
        """返回客户端槽是否已经提交关闭。

        Returns:
            已关闭时为 ``True``，否则为 ``False``。
        """
        return self._closed

    @asynccontextmanager
    async def lease(self) -> AsyncIterator[ClientT]:
        """租用当前客户端，并在上下文结束时自动归还。

        闸门状态检查、客户端快照与计数递增之间没有异步调度点，因此
        每次租用只可能落在切换前或切换后，不会观察到中间状态。

        Yields:
            本次请求固定使用的客户端快照。

        Raises:
            AtomicClientSlotClosedError: 客户端槽已经关闭。
        """
        client = await self._acquire()
        try:
            yield client
        finally:
            self._release()

    async def replace(
        self,
        factory: AsyncClientFactory[ClientT],
        *,
        on_commit: Callable[[], None] | None = None,
    ) -> None:
        """排空当前请求后构造并原子替换客户端。

        并发替换会严格串行。构造失败或提交前取消时继续保留旧客户端；
        成功提交后先同步通知调用方，再开放新租用并把旧客户端恰好关闭一次。

        Args:
            factory: 在旧请求排空后构造新客户端的异步工厂。
            on_commit: 客户端指针切换后、开放新租用前执行的无异常同步回调。

        Raises:
            AtomicClientSlotClosedError: 客户端槽已经关闭。
            BaseException: 客户端工厂、提交回调或旧客户端关闭产生的异常。
        """
        async with self._maintenance_lock:
            if self._closed:
                raise AtomicClientSlotClosedError("客户端槽已关闭，不能替换客户端")
            self._accepting.clear()
            try:
                await self._drained.wait()
                replacement = await factory()
            except BaseException:
                self._accepting.set()
                raise
            previous = self._client
            self._client = replacement
            commit_error: BaseException | None = None
            try:
                if on_commit is not None:
                    on_commit()
            except BaseException as error:
                commit_error = error
            self._accepting.set()
            try:
                if previous is not replacement:
                    await _close_without_interruption(previous)
            except BaseException as close_error:
                if commit_error is not None:
                    raise commit_error from close_error
                raise
            if commit_error is not None:
                raise commit_error

    async def close(self) -> None:
        """排空当前请求并幂等关闭客户端槽。

        提交关闭前取消会恢复租用；提交关闭后取消会延迟到客户端关闭
        完成。无论首次关闭是否报告客户端异常，后续调用都不会重复关闭。
        """
        async with self._maintenance_lock:
            if self._closed:
                return
            self._accepting.clear()
            try:
                await self._drained.wait()
            except BaseException:
                self._accepting.set()
                raise
            client = self._client
            self._client = None
            self._closed = True
            self._accepting.set()
            await _close_without_interruption(client)

    async def _acquire(self) -> ClientT:
        while True:
            await self._accepting.wait()
            if self._closed:
                raise AtomicClientSlotClosedError("客户端槽已关闭，不能继续租用")
            if not self._accepting.is_set():
                continue
            client = self._client
            if client is None:
                raise AssertionError("开放租用的客户端槽必须持有客户端")
            self._active_leases += 1
            if self._active_leases == 1:
                self._drained.clear()
            return client

    def _release(self) -> None:
        self._active_leases -= 1
        if self._active_leases < 0:
            raise AssertionError("客户端租用计数不能小于零")
        if self._active_leases == 0:
            self._drained.set()


async def _close_without_interruption(client: AsyncCloseable) -> None:
    close_task = asyncio.create_task(client.close())
    cancellation: asyncio.CancelledError | None = None
    close_error: BaseException | None = None
    while True:
        try:
            await asyncio.shield(close_task)
        except asyncio.CancelledError as error:
            if close_task.cancelled():
                close_error = error
                break
            cancellation = error
            continue
        except BaseException as error:
            close_error = error
            break
        break
    if cancellation is not None:
        if close_error is not None:
            raise cancellation from close_error
        raise cancellation
    if close_error is not None:
        raise close_error
