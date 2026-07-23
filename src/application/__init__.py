"""应用用例与依赖装配入口。"""

from .factory import create_service
from .service import DownloadService

__all__ = ["DownloadService", "create_service"]
