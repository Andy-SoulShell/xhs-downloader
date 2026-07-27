"""下载进度累计与节流的测试。"""

import pytest
from xhs_adapters.filesystem.progress import ProgressTracker
from xhs_core.domain.models import DownloadProgress


@pytest.mark.asyncio
async def test_no_callback_makes_the_tracker_a_no_op() -> None:
    """不关心进度时不应产生任何累计开销。"""
    tracker = ProgressTracker(3, None)

    await tracker.declare_total(1024)
    await tracker.advance(512)
    await tracker.finish_file()

    assert tracker.snapshot() == DownloadProgress(total_files=3)


@pytest.mark.asyncio
async def test_file_completion_reports_immediately() -> None:
    """文件完成是关键节点, 不能被节流吞掉。"""
    reports: list[DownloadProgress] = []
    tracker = ProgressTracker(2, reports.append)

    await tracker.declare_total(2048)
    await tracker.finish_file()

    assert len(reports) == 1
    assert reports[-1].completed_files == 1
    assert reports[-1].total_files == 2
    assert reports[-1].total_bytes == 2048


@pytest.mark.asyncio
async def test_byte_advances_are_throttled_but_always_accumulated() -> None:
    """每个分块都上报会写穿数据库, 但累计值一次都不能丢。"""
    reports: list[DownloadProgress] = []
    tracker = ProgressTracker(1, reports.append)

    for _ in range(50):
        await tracker.advance(100)

    # 首次 advance 会立即上报, 其后被 0.25 秒的间隔挡住。
    assert len(reports) < 50
    assert tracker.snapshot().received_bytes == 5000


@pytest.mark.asyncio
async def test_retry_rolls_back_the_bytes_of_the_failed_attempt() -> None:
    """重试从头下载, 不回退会让进度虚高甚至超过总量。"""
    reports: list[DownloadProgress] = []
    tracker = ProgressTracker(1, reports.append)

    await tracker.advance(800)
    await tracker.restart_file(800)

    assert tracker.snapshot().received_bytes == 0


@pytest.mark.asyncio
async def test_unknown_content_length_keeps_total_at_zero() -> None:
    """上游不给 Content-Length 时不能编造总量, 界面据此退化为文件计数。"""
    tracker = ProgressTracker(2, lambda _: None)

    await tracker.declare_total(0)
    await tracker.declare_total(-1)

    assert tracker.snapshot().total_bytes == 0
