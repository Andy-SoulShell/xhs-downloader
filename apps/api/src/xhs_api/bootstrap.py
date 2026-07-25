"""HTTP API 的生产依赖装配。"""

from dataclasses import dataclass
from pathlib import Path

from xhs_adapters import (
    BrowserRuntime,
    PublicationRuntime,
    create_browser_runtime,
    create_publication_runtime,
)
from xhs_adapters.config import AppSettings
from xhs_adapters.settings_repository import DotenvSettingsRepository
from xhs_adapters.sqlite import (
    SqliteClientRecordRepository,
    SqlitePostRepository,
    SqliteTaskRepository,
)
from xhs_core.domain.ports import (
    ClientRecordRepository,
    PostRepository,
    TaskRepository,
)

from .settings_service import SettingsManager


@dataclass(frozen=True)
class ApiDependencies:
    """HTTP API 生命周期所需依赖。"""

    browser: BrowserRuntime
    client_records: ClientRecordRepository
    download_tasks: TaskRepository
    posts: PostRepository
    publication: PublicationRuntime
    settings: SettingsManager


def create_api_dependencies(
    settings: AppSettings,
    settings_file: Path,
    runtime_overrides: set[str] | None = None,
) -> ApiDependencies:
    """创建 HTTP API 的生产依赖。

    Args:
        settings: 已验证的运行配置。
        settings_file: 管理后台维护的 dotenv 文件。
        runtime_overrides: 启动参数覆盖的配置字段。

    Returns:
        可供 API 生命周期使用的依赖集合。
    """
    database = settings.state_dir.joinpath("downloads.db")
    return ApiDependencies(
        browser=create_browser_runtime(settings),
        client_records=SqliteClientRecordRepository(database),
        download_tasks=SqliteTaskRepository(database),
        posts=SqlitePostRepository(database),
        publication=create_publication_runtime(settings),
        settings=SettingsManager(
            settings,
            settings_file,
            DotenvSettingsRepository(settings_file),
            runtime_overrides=runtime_overrides,
        ),
    )
