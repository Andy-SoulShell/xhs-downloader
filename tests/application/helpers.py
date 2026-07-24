"""应用层测试使用的内存替身。"""

from hashlib import sha256

from xhs_adapters.config import AppSettings
from xhs_core.domain import DownloadArtifact, DownloadRecord, MediaKind, WorkDetail

from tests.helpers import make_detail


class _Gateway:
    def __init__(self, resolved_url: str | None = None) -> None:
        self.resolved_url = resolved_url
        self.resolved_from: str | None = None
        self.cookie: str | None = None
        self.entered = False
        self.closed = False

    async def __aenter__(self):
        self.entered = True
        return self

    async def close(self) -> None:
        self.closed = True

    async def get_text(self, url: str, cookie: str | None = None) -> str:
        self.cookie = cookie
        return "synthetic"

    async def resolve(self, url: str) -> str:
        self.resolved_from = url
        return self.resolved_url or url


class _Parser:
    def parse(self, html: str, source_url: str) -> WorkDetail:
        return make_detail(source_url)


class _Downloader:
    def __init__(
        self,
        settings: AppSettings,
        *,
        produce_artifacts: bool = True,
    ) -> None:
        self._settings = settings
        self._produce_artifacts = produce_artifacts
        self.calls = 0
        self.indexes: set[int] | None = None

    async def download(
        self,
        detail: WorkDetail,
        indexes: set[int] | None = None,
    ) -> list[DownloadArtifact]:
        self.calls += 1
        self.indexes = indexes
        if not self._produce_artifacts:
            return []
        file = self._settings.download_dir.joinpath("synthetic.mp4")
        file.parent.mkdir(parents=True, exist_ok=True)
        content = f"synthetic-{self.calls}".encode()
        file.write_bytes(content)
        return [
            DownloadArtifact(
                path=str(file.relative_to(self._settings.output_root)),
                sha256=sha256(content).hexdigest(),
                size=len(content),
                media_index=1,
                kind=MediaKind.VIDEO,
            )
        ]


class _Repository:
    def __init__(self, record: DownloadRecord | None = None) -> None:
        self.record = record
        self.saved = 0

    async def get(self, work_id: str) -> DownloadRecord | None:
        return self.record

    async def save(self, record: DownloadRecord) -> None:
        self.record = record
        self.saved += 1
