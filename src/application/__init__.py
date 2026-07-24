"""应用用例与依赖装配入口。"""

from .factory import create_service
from .service import DownloadService
from .tasks import DownloadTaskCoordinator

__all__ = ["DownloadService", "DownloadTaskCoordinator", "create_service"]
