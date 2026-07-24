"""内容发布子系统的生产依赖装配。"""

from dataclasses import dataclass

from src.config import AppSettings
from src.infrastructure import (
    FilePublicationAssetStore,
    SqliteExtensionCredentialRepository,
    SqlitePublicationDraftRepository,
    SqlitePublicationTaskRepository,
)

from .publication_auth import ExtensionCredentialService
from .publication_drafts import PublicationDraftService
from .publication_execution import PublicationExecutionService
from .publication_scheduler import PublicationScheduler
from .publication_tasks import PublicationTaskService


@dataclass(frozen=True)
class PublicationRuntime:
    """内容发布服务及其生命周期组件。"""

    drafts: PublicationDraftService
    tasks: PublicationTaskService
    execution: PublicationExecutionService
    credentials: ExtensionCredentialService
    scheduler: PublicationScheduler


def create_publication_runtime(settings: AppSettings) -> PublicationRuntime:
    """使用生产基础设施创建内容发布服务。

    Args:
        settings: 已验证的应用配置。

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
