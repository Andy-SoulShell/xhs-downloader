"""xhs-downloader 基础设施适配器。"""

from .config import AppSettings
from .factory import (
    BrowserRuntime,
    PublicationRuntime,
    create_browser_runtime,
    create_download_service,
    create_publication_runtime,
)
from .http_feed_detail import HttpFeedDetailProvider
from .managed_browser import ChromiumController

__all__ = [
    "AppSettings",
    "BrowserRuntime",
    "ChromiumController",
    "HttpFeedDetailProvider",
    "PublicationRuntime",
    "create_browser_runtime",
    "create_download_service",
    "create_publication_runtime",
]
