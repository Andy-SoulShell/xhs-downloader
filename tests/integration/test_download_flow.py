"""作品解析、下载与记录复用的离线集成测试。"""

from pathlib import Path

import httpx
from xhs_adapters.config import AppSettings
from xhs_adapters.filesystem import FileDownloader
from xhs_adapters.http import HttpxGateway
from xhs_adapters.parsing import InitialStateParser
from xhs_adapters.sqlite import SqliteDownloadRepository
from xhs_core.application.download import DownloadService

from tests.helpers import make_initial_state_html

URL = "https://www.xiaohongshu.com/explore/synthetic-work"


async def test_real_components_complete_and_reuse_download(
    tmp_path: Path,
) -> None:
    """确保真实组件可离线完成解析、落盘、记录和复用。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    media_requests = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal media_requests
        if request.url.host == "www.xiaohongshu.com":
            return httpx.Response(200, text=make_initial_state_html())
        media_requests += 1
        return httpx.Response(
            200,
            headers={"Content-Type": "video/mp4"},
            content=b"synthetic-video",
        )

    settings = AppSettings(work_path=tmp_path, max_retry=0)
    gateway = HttpxGateway(settings, transport=httpx.MockTransport(handler))
    repository = SqliteDownloadRepository(settings.state_dir.joinpath("downloads.db"))
    service = DownloadService(
        settings,
        gateway,
        InitialStateParser(settings),
        FileDownloader(settings, gateway),
        repository,
    )

    async with service:
        first = await service.download(URL)
        second = await service.download(URL)

    target = settings.output_root.joinpath(first.artifacts[0].path)
    assert target.read_bytes() == b"synthetic-video"
    assert not first.skipped
    assert second.skipped
    assert media_requests == 1
    assert await repository.get("synthetic-work") is not None
