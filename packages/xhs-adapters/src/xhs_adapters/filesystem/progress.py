"""下载进度累计与上报节流。"""

from asyncio import Lock
from collections.abc import Callable
from time import monotonic

from xhs_core.domain.models import DownloadProgress

ProgressCallback = Callable[[DownloadProgress], None]

_REPORT_INTERVAL_SECONDS = 0.25
"""上报间隔。每个分块都上报会把数据库写穿，四分之一秒足够让进度条看起来连续。"""


class ProgressTracker:
    """汇总同一任务内多个文件的下载进度。

    多个媒体并发下载，字节数必须原子累加；上报按固定间隔节流，
    但文件完成和全部结束这两个节点一定立即上报，避免进度停在中途。

    Args:
        total_files: 本次任务需要下载的文件总数。
        on_progress: 进度回调；为空时整个跟踪器退化为空操作。
    """

    def __init__(
        self,
        total_files: int,
        on_progress: ProgressCallback | None,
    ) -> None:
        self._total_files = total_files
        self._on_progress = on_progress
        self._lock = Lock()
        self._completed_files = 0
        self._received_bytes = 0
        self._total_bytes = 0
        self._last_report = 0.0

    def snapshot(self) -> DownloadProgress:
        """读取当前进度快照。

        Returns:
            可直接持久化的进度值。
        """
        return DownloadProgress(
            completed_files=self._completed_files,
            total_files=self._total_files,
            received_bytes=self._received_bytes,
            total_bytes=self._total_bytes,
        )

    async def declare_total(self, size: int) -> None:
        """登记某个文件的已知字节总量。

        Args:
            size: 响应头给出的字节数；上游未提供时传 0。
        """
        if not self._on_progress or size <= 0:
            return
        async with self._lock:
            self._total_bytes += size

    async def advance(self, size: int) -> None:
        """累加已接收字节并按节流上报。

        Args:
            size: 本次写入的字节数。
        """
        if not self._on_progress:
            return
        async with self._lock:
            self._received_bytes += size
            now = monotonic()
            if now - self._last_report < _REPORT_INTERVAL_SECONDS:
                return
            self._last_report = now
            snapshot = self.snapshot()
        self._on_progress(snapshot)

    async def finish_file(self) -> None:
        """标记一个文件下载完成并立即上报。"""
        if not self._on_progress:
            return
        async with self._lock:
            self._completed_files += 1
            self._last_report = monotonic()
            snapshot = self.snapshot()
        self._on_progress(snapshot)

    async def restart_file(self, received: int) -> None:
        """重试前回退该文件已累计的字节，避免进度虚高。

        Args:
            received: 上一次尝试已经计入的字节数。
        """
        if not self._on_progress or received <= 0:
            return
        async with self._lock:
            self._received_bytes = max(0, self._received_bytes - received)
