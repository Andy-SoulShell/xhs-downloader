"""领域模型、端口和纯业务规则。"""

from .errors import (
    DownloadError,
    InvalidLinkError,
    InvalidPartialContentError,
    ParseError,
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
    "InvalidLinkError",
    "InvalidPartialContentError",
    "MediaKind",
    "MediaResource",
    "ParseError",
    "WorkDetail",
    "WorkType",
    "XhsError",
]
