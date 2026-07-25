"""xhs-downloader 基础设施适配器。"""

from .config import AppSettings
from .factory import (
    BrowserRuntime,
    PublicationRuntime,
    create_browser_runtime,
    create_download_service,
    create_publication_runtime,
)
from .managed_browser import ChromiumController

__all__ = [
    "AppSettings",
    "BrowserRuntime",
    "ChromiumController",
    "PublicationRuntime",
    "create_browser_runtime",
    "create_download_service",
    "create_publication_runtime",
]
