"""HTTP、解析、下载和持久化基础设施实现。"""

from .client_record_repository import SqliteClientRecordRepository
from .downloader import FileDownloader
from .http import HttpxGateway
from .parser import InitialStateParser
from .repository import SqliteDownloadRepository
from .task_repository import SqliteTaskRepository

__all__ = [
    "FileDownloader",
    "HttpxGateway",
    "InitialStateParser",
    "SqliteClientRecordRepository",
    "SqliteDownloadRepository",
    "SqliteTaskRepository",
]
