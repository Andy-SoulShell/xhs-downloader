"""应用服务依赖装配。"""

from src.config import AppSettings
from src.infrastructure import (
    FileDownloader,
    HttpxGateway,
    InitialStateParser,
    SqliteDownloadRepository,
)

from .service import DownloadService


def create_service(settings: AppSettings) -> DownloadService:
    """使用生产基础设施创建下载服务。

    Args:
        settings: 已验证的应用配置。

    Returns:
        尚未进入生命周期的下载服务。
    """
    gateway = HttpxGateway(settings)
    parser = InitialStateParser(settings)
    downloader = FileDownloader(settings, gateway)
    repository = SqliteDownloadRepository(settings.state_dir.joinpath("downloads.db"))
    return DownloadService(
        settings=settings,
        gateway=gateway,
        parser=parser,
        downloader=downloader,
        repository=repository,
    )
