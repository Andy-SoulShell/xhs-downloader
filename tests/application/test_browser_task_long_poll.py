"""浏览器扩展任务长轮询的唤醒、周期检查与取消测试。"""

import asyncio

import pytest
from xhs_adapters.sqlite import SqliteBrowserTaskRepository
from xhs_core.application import BrowserExecutionService, BrowserTaskService
from xhs_core.domain import (
    BrowserDriver,
    BrowserTaskError,
    BrowserTaskKind,
    BrowserTaskStatus,
)


def _services(tmp_path):
    repository = SqliteBrowserTaskRepository(tmp_path.joinpath("state.db"))
    return (
        repository,
        BrowserTaskService(repository),
        BrowserExecutionService(repository, lease_seconds=60),
    )


async def test_long_poll_wakes_immediately_for_extension_submission(
    tmp_path,
) -> None:
    """确保扩展任务提交后无需等到周期检查即可被领取。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    _, tasks, execution = _services(tmp_path)
    first_probe = asyncio.Event()

    async def probe():
        claim = await execution.claim("synthetic-extension")
        first_probe.set()
        return claim

    waiting = asyncio.create_task(tasks.wait_for_claim(probe, 2, recheck_seconds=1))
    await first_probe.wait()
    assert not waiting.done()

    submitted = await tasks.submit(BrowserTaskKind.CHECK_LOGIN_STATUS, {})
    claim = await asyncio.wait_for(waiting, 0.5)

    assert claim is not None
    assert claim.task.task_id == submitted.task_id
    assert claim.task.target_driver is BrowserDriver.EXTENSION


async def test_managed_submission_does_not_wake_extension_long_poll(
    tmp_path,
) -> None:
    """确保受管任务不触发扩展唤醒，后续扩展任务仍会立即唤醒。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    _, tasks, execution = _services(tmp_path)
    first_probe = asyncio.Event()
    probes = 0

    async def probe():
        nonlocal probes
        probes += 1
        claim = await execution.claim(
            "synthetic-extension",
            BrowserDriver.EXTENSION,
        )
        first_probe.set()
        return claim

    waiting = asyncio.create_task(tasks.wait_for_claim(probe, 2, recheck_seconds=1))
    await first_probe.wait()
    managed = await tasks.submit(
        BrowserTaskKind.CHECK_LOGIN_STATUS,
        {},
        target_driver=BrowserDriver.MANAGED,
    )
    await asyncio.sleep(0.03)

    assert probes == 1
    assert not waiting.done()

    extension = await tasks.submit(BrowserTaskKind.CHECK_LOGIN_STATUS, {})
    claim = await asyncio.wait_for(waiting, 0.5)

    assert claim is not None
    assert claim.task.task_id == extension.task_id
    assert (await tasks.require(managed.task_id)).status is BrowserTaskStatus.QUEUED


async def test_long_poll_periodically_detects_external_queue_changes(
    tmp_path,
) -> None:
    """确保没有进程内通知时仍通过有界周期检查发现任务。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    repository, tasks, execution = _services(tmp_path)
    task = await tasks.submit(
        BrowserTaskKind.LIST_FEEDS,
        {},
        target_driver=BrowserDriver.MANAGED,
    )
    first_probe = asyncio.Event()
    probes = 0

    async def probe():
        nonlocal probes
        probes += 1
        claim = await execution.claim("synthetic-extension")
        first_probe.set()
        return claim

    waiting = asyncio.create_task(
        tasks.wait_for_claim(probe, 0.5, recheck_seconds=0.02)
    )
    await first_probe.wait()
    await repository.save(
        task.model_copy(update={"target_driver": BrowserDriver.EXTENSION})
    )
    claim = await asyncio.wait_for(waiting, 0.2)

    assert claim is not None
    assert claim.task.task_id == task.task_id
    assert probes >= 2


async def test_cancelled_long_poll_leaves_future_waiters_usable(tmp_path) -> None:
    """确保取消空队列等待不会泄漏或阻塞后续长轮询。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    _, tasks, execution = _services(tmp_path)
    first_probe = asyncio.Event()

    async def probe():
        claim = await execution.claim("synthetic-extension")
        first_probe.set()
        return claim

    canceled = asyncio.create_task(tasks.wait_for_claim(probe, 2, recheck_seconds=1))
    await first_probe.wait()
    canceled.cancel()
    with pytest.raises(asyncio.CancelledError):
        await canceled

    first_probe.clear()
    replacement = asyncio.create_task(tasks.wait_for_claim(probe, 2, recheck_seconds=1))
    await first_probe.wait()
    task = await tasks.submit(BrowserTaskKind.GET_MY_PROFILE, {})
    claim = await asyncio.wait_for(replacement, 0.5)

    assert claim is not None
    assert claim.task.task_id == task.task_id


async def test_multiple_long_polls_claim_one_task_only_once(tmp_path) -> None:
    """确保多个扩展被同时唤醒时仍只有一个能原子领取同一任务。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    _, tasks, execution = _services(tmp_path)
    first_probes = [asyncio.Event(), asyncio.Event()]

    async def probe(index: int):
        claim = await execution.claim(f"synthetic-extension-{index}")
        first_probes[index].set()
        return claim

    waiters = {
        asyncio.create_task(
            tasks.wait_for_claim(
                lambda index=index: probe(index),
                2,
                recheck_seconds=1,
            )
        )
        for index in range(2)
    }
    await asyncio.gather(*(event.wait() for event in first_probes))
    task = await tasks.submit(BrowserTaskKind.CHECK_LOGIN_STATUS, {})
    completed, pending = await asyncio.wait(
        waiters,
        timeout=0.5,
        return_when=asyncio.FIRST_COMPLETED,
    )

    assert len(completed) == 1
    assert len(pending) == 1
    claim = next(iter(completed)).result()
    assert claim is not None
    assert claim.task.task_id == task.task_id

    waiting = next(iter(pending))
    waiting.cancel()
    with pytest.raises(asyncio.CancelledError):
        await waiting


async def test_long_poll_validates_bounds_and_supports_immediate_probe(
    tmp_path,
) -> None:
    """确保等待范围严格受限，零秒仍执行一次非阻塞领取。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    _, tasks, execution = _services(tmp_path)

    async def probe():
        return await execution.claim("synthetic-extension")

    assert await tasks.wait_for_claim(probe, 0) is None
    assert await tasks.wait_for_claim(probe, 0.01, recheck_seconds=1) is None
    for wait_seconds in (-0.01, 30.01):
        with pytest.raises(BrowserTaskError, match="等待参数无效"):
            await tasks.wait_for_claim(probe, wait_seconds)
    with pytest.raises(BrowserTaskError, match="等待参数无效"):
        await tasks.wait_for_claim(probe, 1, recheck_seconds=0)
