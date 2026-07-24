"""xhs-downloader 基础设施适配器。"""

from .config import AppSettings
from .factory import (
    PublicationRuntime,
    create_download_service,
    create_publication_runtime,
)

__all__ = [
    "AppSettings",
    "PublicationRuntime",
    "create_download_service",
    "create_publication_runtime",
]
