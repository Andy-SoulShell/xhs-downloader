"""共享基础设施的生产装配工厂。"""

from dataclasses import dataclass

from xhs_core.application import (
    BrowserExecutionService,
    BrowserTaskService,
    DownloadService,
    ExtensionCredentialService,
    PublicationDraftService,
    PublicationExecutionService,
    PublicationScheduler,
    PublicationTaskService,
)

from .config import AppSettings
from .filesystem import FileDownloader, FilePublicationAssetStore
from .http import HttpxGateway
from .parsing import InitialStateParser
from .sqlite import (
    SqliteBrowserTaskRepository,
    SqliteDownloadRepository,
    SqliteExtensionCredentialRepository,
    SqlitePublicationDraftRepository,
    SqlitePublicationTaskRepository,
)


@dataclass(frozen=True)
class BrowserRuntime:
    """通用浏览器任务的管理与扩展执行用例。"""

    tasks: BrowserTaskService
    execution: BrowserExecutionService


@dataclass(frozen=True)
class PublicationRuntime:
    """内容发布服务及其生命周期组件。"""

    drafts: PublicationDraftService
    tasks: PublicationTaskService
    execution: PublicationExecutionService
    credentials: ExtensionCredentialService
    scheduler: PublicationScheduler


def create_download_service(settings: AppSettings) -> DownloadService:
    """使用生产适配器创建下载服务。

    Args:
        settings: 已验证的运行配置。

    Returns:
        尚未进入生命周期的下载服务。
    """
    gateway = HttpxGateway(settings)
    return DownloadService(
        settings=settings,
        gateway=gateway,
        parser=InitialStateParser(settings),
        downloader=FileDownloader(settings, gateway),
        repository=SqliteDownloadRepository(
            settings.state_dir.joinpath("downloads.db")
        ),
    )


def create_browser_runtime(settings: AppSettings) -> BrowserRuntime:
    """创建通用浏览器任务运行时。

    Args:
        settings: 已验证的运行配置。

    Returns:
        共享同一 SQLite 仓储的任务管理与执行用例。
    """
    repository = SqliteBrowserTaskRepository(
        settings.state_dir.joinpath("downloads.db")
    )
    return BrowserRuntime(
        tasks=BrowserTaskService(repository),
        execution=BrowserExecutionService(
            repository,
            settings.browser_task_lease_seconds,
        ),
    )


def create_publication_runtime(settings: AppSettings) -> PublicationRuntime:
    """使用生产适配器创建内容发布运行时。

    Args:
        settings: 已验证的运行配置。

    Returns:
        尚未启动调度器的发布运行时。
    """
    database_path = settings.state_dir.joinpath("downloads.db")
    task_repository = SqlitePublicationTaskRepository(database_path)
    asset_store = FilePublicationAssetStore(settings.publication_dir)
    scheduler = PublicationScheduler(task_repository)
    return PublicationRuntime(
        drafts=PublicationDraftService(
            SqlitePublicationDraftRepository(database_path),
            task_repository,
            asset_store,
            settings.publish_max_asset_size,
        ),
        tasks=PublicationTaskService(task_repository, scheduler),
        execution=PublicationExecutionService(
            task_repository,
            asset_store,
            scheduler,
            settings.publish_lease_seconds,
        ),
        credentials=ExtensionCredentialService(
            SqliteExtensionCredentialRepository(database_path)
        ),
        scheduler=scheduler,
    )
