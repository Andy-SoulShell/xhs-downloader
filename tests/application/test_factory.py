"""应用服务依赖装配测试。"""

from pathlib import Path

from src.application.factory import create_service
from src.config import AppSettings
from src.infrastructure import (
    FileDownloader,
    HttpxGateway,
    InitialStateParser,
    SqliteDownloadRepository,
)


async def test_create_service_wires_production_adapters(tmp_path: Path) -> None:
    """确保默认工厂装配正确的基础设施实现。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    service = create_service(AppSettings(work_path=tmp_path))

    assert isinstance(service._gateway, HttpxGateway)
    assert isinstance(service._parser, InitialStateParser)
    assert isinstance(service._downloader, FileDownloader)
    assert isinstance(service._repository, SqliteDownloadRepository)
    await service.__aexit__(None, None, None)
