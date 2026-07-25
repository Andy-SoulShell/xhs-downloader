"""异步原子客户端槽的排空、切换与取消语义测试。"""

import asyncio

import pytest
from xhs_core.application import AtomicClientSlot, AtomicClientSlotClosedError


class _Client:
    def __init__(
        self,
        name: str,
        *,
        block_close: bool = False,
        close_error: Exception | None = None,
    ) -> None:
        self.name = name
        self.close_calls = 0
        self.close_started = asyncio.Event()
        self.allow_close = asyncio.Event()
        self.close_error = close_error
        if not block_close:
            self.allow_close.set()

    async def close(self) -> None:
        self.close_calls += 1
        self.close_started.set()
        await self.allow_close.wait()
        if self.close_error is not None:
            raise self.close_error


async def _build(client: _Client) -> _Client:
    return client


async def _lease_name(slot: AtomicClientSlot[_Client]) -> str:
    async with slot.lease() as client:
        return client.name


async def test_replace_drains_old_requests_and_blocks_new_leases() -> None:
    """确保旧请求完整结束，新请求只会拿到一次性切换后的客户端。"""
    old = _Client("old")
    new = _Client("new")
    slot = AtomicClientSlot(old)
    old_entered = asyncio.Event()
    release_old = asyncio.Event()
    factory_called = asyncio.Event()

    async def use_old() -> None:
        async with slot.lease() as client:
            assert client is old
            old_entered.set()
            await release_old.wait()

    async def factory() -> _Client:
        factory_called.set()
        return new

    old_request = asyncio.create_task(use_old())
    await old_entered.wait()
    replacement = asyncio.create_task(slot.replace(factory))
    await asyncio.sleep(0)
    new_request = asyncio.create_task(_lease_name(slot))
    await asyncio.sleep(0)

    assert not factory_called.is_set()
    assert not replacement.done()
    assert not new_request.done()

    release_old.set()
    await old_request
    await replacement

    assert await new_request == "new"
    assert old.close_calls == 1
    await slot.close()


async def test_factory_failure_keeps_old_client_available() -> None:
    """确保新客户端构造失败会重新开放旧客户端且不会误关资源。"""
    old = _Client("old")
    slot = AtomicClientSlot(old)

    async def fail() -> _Client:
        raise RuntimeError("synthetic factory failure")

    with pytest.raises(RuntimeError, match="synthetic factory failure"):
        await slot.replace(fail)

    assert await _lease_name(slot) == "old"
    assert old.close_calls == 0
    await slot.close()


async def test_replace_cancellation_while_draining_restores_leases() -> None:
    """确保排空阶段取消替换不会永久关闭租用闸门。"""
    old = _Client("old")
    new = _Client("new")
    slot = AtomicClientSlot(old)
    factory_called = asyncio.Event()

    async def factory() -> _Client:
        factory_called.set()
        return new

    async with slot.lease():
        replacement = asyncio.create_task(slot.replace(factory))
        await asyncio.sleep(0)
        replacement.cancel()
        with pytest.raises(asyncio.CancelledError):
            await replacement

        assert await _lease_name(slot) == "old"

    assert not factory_called.is_set()
    assert old.close_calls == 0
    await slot.close()


async def test_replace_cancellation_during_factory_restores_old_client() -> None:
    """确保工厂构造期间取消替换也会重新开放旧客户端。"""
    old = _Client("old")
    slot = AtomicClientSlot(old)
    factory_started = asyncio.Event()

    async def factory() -> _Client:
        factory_started.set()
        await asyncio.Event().wait()
        raise AssertionError("构造等待不应自然结束")

    replacement = asyncio.create_task(slot.replace(factory))
    await factory_started.wait()
    replacement.cancel()
    with pytest.raises(asyncio.CancelledError):
        await replacement

    assert await _lease_name(slot) == "old"
    assert old.close_calls == 0
    await slot.close()


async def test_replace_cancellation_after_commit_finishes_old_close() -> None:
    """确保切换提交后的取消先完成旧客户端关闭，再向调用方传播。"""
    old = _Client("old", block_close=True)
    new = _Client("new")
    slot = AtomicClientSlot(old)
    committed: list[str] = []

    replacement = asyncio.create_task(
        slot.replace(
            lambda: _build(new),
            on_commit=lambda: committed.append(new.name),
        )
    )
    await old.close_started.wait()

    assert committed == ["new"]
    assert await _lease_name(slot) == "new"
    replacement.cancel()
    await asyncio.sleep(0)
    assert not replacement.done()

    old.allow_close.set()
    with pytest.raises(asyncio.CancelledError):
        await replacement

    assert old.close_calls == 1
    assert await _lease_name(slot) == "new"
    await slot.close()


async def test_concurrent_replacements_are_fully_serialized() -> None:
    """确保下一次替换要等前一次旧客户端关闭完成后才开始构造。"""
    old = _Client("old", block_close=True)
    middle = _Client("middle")
    latest = _Client("latest")
    slot = AtomicClientSlot(old)
    second_factory_started = asyncio.Event()

    async def second_factory() -> _Client:
        second_factory_started.set()
        return latest

    first = asyncio.create_task(slot.replace(lambda: _build(middle)))
    await old.close_started.wait()
    second = asyncio.create_task(slot.replace(second_factory))
    await asyncio.sleep(0)

    assert not second_factory_started.is_set()

    old.allow_close.set()
    await first
    await second_factory_started.wait()
    await second

    assert old.close_calls == 1
    assert middle.close_calls == 1
    assert await _lease_name(slot) == "latest"
    await slot.close()


async def test_cancelled_lease_releases_drain_count() -> None:
    """确保请求取消仍归还租用，使后续替换能够完成。"""
    old = _Client("old")
    new = _Client("new")
    slot = AtomicClientSlot(old)
    entered = asyncio.Event()

    async def request() -> None:
        async with slot.lease():
            entered.set()
            await asyncio.Event().wait()

    active = asyncio.create_task(request())
    await entered.wait()
    replacement = asyncio.create_task(slot.replace(lambda: _build(new)))
    await asyncio.sleep(0)
    assert not replacement.done()

    active.cancel()
    with pytest.raises(asyncio.CancelledError):
        await active
    await replacement

    assert await _lease_name(slot) == "new"
    await slot.close()


async def test_close_drains_requests_and_is_idempotent() -> None:
    """确保关闭排空现有请求、拒绝新请求且只关闭客户端一次。"""
    client = _Client("only")
    slot = AtomicClientSlot(client)

    async with slot.lease():
        closing = asyncio.create_task(slot.close())
        await asyncio.sleep(0)
        waiting = asyncio.create_task(_lease_name(slot))
        await asyncio.sleep(0)
        assert not closing.done()
        assert not waiting.done()

    await closing
    with pytest.raises(AtomicClientSlotClosedError, match="已关闭"):
        await waiting
    with pytest.raises(AtomicClientSlotClosedError, match="已关闭"):
        await slot.replace(lambda: _build(_Client("unused")))
    await slot.close()

    assert slot.closed
    assert client.close_calls == 1


async def test_close_cancellation_before_commit_restores_slot() -> None:
    """确保排空阶段取消关闭后，旧客户端仍可继续租用和再次关闭。"""
    client = _Client("only")
    slot = AtomicClientSlot(client)

    async with slot.lease():
        closing = asyncio.create_task(slot.close())
        await asyncio.sleep(0)
        closing.cancel()
        with pytest.raises(asyncio.CancelledError):
            await closing

        assert not slot.closed
        assert await _lease_name(slot) == "only"

    await slot.close()
    assert client.close_calls == 1


async def test_close_failure_is_reported_without_repeated_close() -> None:
    """确保客户端关闭异常可见，但幂等重试不会再次关闭同一客户端。"""
    client = _Client(
        "broken",
        close_error=RuntimeError("synthetic close failure"),
    )
    slot = AtomicClientSlot(client)

    with pytest.raises(RuntimeError, match="synthetic close failure"):
        await slot.close()
    await slot.close()

    assert slot.closed
    assert client.close_calls == 1
