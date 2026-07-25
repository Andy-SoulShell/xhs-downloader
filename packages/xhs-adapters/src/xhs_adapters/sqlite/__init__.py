"""SQLite 持久化适配器。"""

from .browser_tasks import SqliteBrowserTaskRepository
from .client_records import SqliteClientRecordRepository
from .download_records import SqliteDownloadRepository
from .download_tasks import SqliteTaskRepository
from .extension_credentials import SqliteExtensionCredentialRepository
from .posts import SqlitePostRepository
from .publication_drafts import SqlitePublicationDraftRepository
from .publication_tasks import SqlitePublicationTaskRepository

__all__ = [
    "SqliteBrowserTaskRepository",
    "SqliteClientRecordRepository",
    "SqliteDownloadRepository",
    "SqliteExtensionCredentialRepository",
    "SqlitePostRepository",
    "SqlitePublicationDraftRepository",
    "SqlitePublicationTaskRepository",
    "SqliteTaskRepository",
]
