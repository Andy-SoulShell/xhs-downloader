"""应用服务依赖装配测试。"""

from pathlib import Path

from xhs_adapters import create_download_service
from xhs_adapters.config import AppSettings
from xhs_adapters.filesystem import FileDownloader
from xhs_adapters.http import HttpxGateway
from xhs_adapters.parsing import InitialStateParser
from xhs_adapters.sqlite import SqliteDownloadRepository


async def test_create_service_wires_production_adapters(tmp_path: Path) -> None:
    """确保默认工厂装配正确的基础设施实现。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    service = create_download_service(AppSettings(work_path=tmp_path))

    assert isinstance(service._gateway, HttpxGateway)
    assert isinstance(service._parser, InitialStateParser)
    assert isinstance(service._downloader, FileDownloader)
    assert isinstance(service._repository, SqliteDownloadRepository)
    await service.__aexit__(None, None, None)
