"""应用用例与依赖装配入口。"""

from .factory import create_service
from .service import DownloadService
from .settings import SettingsManager, SettingsSnapshot
from .tasks import DownloadTaskCoordinator

__all__ = [
    "DownloadService",
    "DownloadTaskCoordinator",
    "SettingsManager",
    "SettingsSnapshot",
    "create_service",
]
