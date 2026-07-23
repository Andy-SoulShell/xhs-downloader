"""xhs-downloader 公共 Python API。"""

from .client import XHS
from .config import AppSettings
from .interfaces import create_api, create_mcp

__all__ = ["XHS", "AppSettings", "create_api", "create_mcp"]
