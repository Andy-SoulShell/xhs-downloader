"""领域模型、端口和纯业务规则。"""

from .errors import (
    DownloadError,
    InvalidLinkError,
    InvalidPartialContentError,
    ParseError,
    TaskStateError,
    XhsError,
)
from .models import (
    Author,
    ClientDownloadRecord,
    ClientRecordStatus,
    DownloadArtifact,
    DownloadMode,
    DownloadOutcome,
    DownloadRecord,
    DownloadTask,
    DownloadTaskStatus,
    MediaKind,
    MediaResource,
    WorkDetail,
    WorkType,
)

__all__ = [
    "Author",
    "ClientDownloadRecord",
    "ClientRecordStatus",
    "DownloadArtifact",
    "DownloadError",
    "DownloadMode",
    "DownloadOutcome",
    "DownloadRecord",
    "DownloadTask",
    "DownloadTaskStatus",
    "InvalidLinkError",
    "InvalidPartialContentError",
    "MediaKind",
    "MediaResource",
    "ParseError",
    "TaskStateError",
    "WorkDetail",
    "WorkType",
    "XhsError",
]
