"""下载应用服务测试。"""

from contextlib import asynccontextmanager
from datetime import UTC, datetime
from hashlib import sha256
from pathlib import Path

from src.application.service import DownloadService
from src.config import AppSettings
from src.domain import (
    Author,
    DownloadArtifact,
    DownloadRecord,
    MediaKind,
    MediaResource,
    WorkDetail,
    WorkType,
)

URL = "https://www.xiaohongshu.com/explore/synthetic-work"


async def test_valid_fingerprint_record_skips_second_download(tmp_path: Path) -> None:
    """确保指纹与文件哈希均有效时才复用下载记录。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    settings = AppSettings(work_path=tmp_path)
    repository = _Repository()
    downloader = _Downloader(settings)
    service = DownloadService(
        settings,
        _Gateway(),
        _Parser(),
        downloader,
        repository,
    )

    first = await service.download(URL)
    second = await service.download(URL)

    assert not first.skipped
    assert second.skipped
    assert downloader.calls == 1


async def test_changed_file_is_downloaded_again(tmp_path: Path) -> None:
    """确保本地文件被修改后不会静默复用旧记录。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    settings = AppSettings(work_path=tmp_path)
    repository = _Repository()
    downloader = _Downloader(settings)
    service = DownloadService(
        settings,
        _Gateway(),
        _Parser(),
        downloader,
        repository,
    )
    first = await service.download(URL)
    file = settings.output_root.joinpath(first.artifacts[0].path)
    file.write_bytes(b"changed")

    outcome = await service.download(URL)

    assert not outcome.skipped
    assert downloader.calls == 2


async def test_cn_short_link_enters_redirect_flow(tmp_path: Path) -> None:
    """确保 .cn 分享链接补全协议后交给网关解析。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    settings = AppSettings(work_path=tmp_path)
    gateway = _RedirectGateway()
    service = DownloadService(
        settings,
        gateway,
        _Parser(),
        _Downloader(settings),
        _Repository(),
    )

    normalized = await service.normalize_url("复制 xhslink.cn/synthetic-short")

    assert gateway.resolved_from == "https://xhslink.cn/synthetic-short"
    assert normalized == URL


class _Gateway:
    async def get_text(self, url: str, cookie: str | None = None) -> str:
        return "synthetic"

    async def resolve(self, url: str) -> str:
        return url

    @asynccontextmanager
    async def stream(self, url: str, headers=None):
        yield None


class _RedirectGateway(_Gateway):
    def __init__(self) -> None:
        self.resolved_from: str | None = None

    async def resolve(self, url: str) -> str:
        self.resolved_from = url
        return URL


class _Parser:
    def parse(self, html: str, source_url: str) -> WorkDetail:
        return _detail(source_url)


class _Downloader:
    def __init__(self, settings: AppSettings) -> None:
        self._settings = settings
        self.calls = 0

    async def download(
        self,
        detail: WorkDetail,
        indexes: set[int] | None = None,
    ) -> list[DownloadArtifact]:
        self.calls += 1
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
    def __init__(self) -> None:
        self.record: DownloadRecord | None = None

    async def get(self, work_id: str) -> DownloadRecord | None:
        return self.record

    async def save(self, record: DownloadRecord) -> None:
        self.record = record


def _detail(source_url: str) -> WorkDetail:
    return WorkDetail(
        work_id="synthetic-work",
        source_url=source_url,
        title="合成测试作品",
        description="完全合成的测试文本",
        work_type=WorkType.VIDEO,
        published_at=datetime(2024, 1, 1, tzinfo=UTC),
        author=Author(
            author_id="synthetic-author",
            nickname="合成作者",
            profile_url="https://example.invalid/author",
        ),
        media=[
            MediaResource(
                index=1,
                kind=MediaKind.VIDEO,
                url="https://example.invalid/synthetic.mp4",
                suffix="mp4",
            )
        ],
    )
