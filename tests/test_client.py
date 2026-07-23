"""Python 高层客户端测试。"""

from pathlib import Path

import pytest

from src.client import XHS
from src.domain import DownloadOutcome
from tests.helpers import make_detail


class _Service:
    def __init__(self) -> None:
        self.entered = False
        self.exited = False
        self.download_arguments = None

    async def __aenter__(self):
        self.entered = True
        return self

    async def __aexit__(self, exc_type, exc_value, traceback) -> None:
        self.exited = True

    async def get_detail(self, url: str):
        return make_detail(url)

    async def download(self, url: str, indexes, force: bool):
        self.download_arguments = (url, indexes, force)
        return DownloadOutcome(message="完成", detail=make_detail(url))


async def test_client_requires_managed_lifecycle(tmp_path: Path) -> None:
    """确保未进入异步上下文时不会泄漏半初始化服务。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    client = XHS(work_path=tmp_path)

    with pytest.raises(RuntimeError, match="async with"):
        await client.detail("https://example.invalid")


async def test_client_delegates_detail_and_download(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """确保客户端管理服务生命周期并返回可序列化字典。

    Args:
        tmp_path: Pytest 提供的临时目录。
        monkeypatch: Pytest 提供的替换工具。
    """
    service = _Service()
    monkeypatch.setattr("src.client.create_service", lambda settings: service)
    url = "https://www.xiaohongshu.com/explore/synthetic-work"

    async with XHS(work_path=tmp_path) as client:
        detail = await client.detail(url)
        outcome = await client.download(url, {2}, force=True)
        assert service.entered

    assert detail["作品ID"] == "synthetic-work"
    assert outcome["message"] == "完成"
    assert service.download_arguments == (url, {2}, True)
    assert service.exited
    assert client._service is None
