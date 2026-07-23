"""文件下载器边界行为测试。"""

from contextlib import asynccontextmanager
from hashlib import sha256
from pathlib import Path

import httpx
import pytest

from src.config import AppSettings
from src.domain import MediaKind, MediaResource
from src.domain.errors import DownloadError, InvalidPartialContentError
from src.infrastructure.downloader import FileDownloader
from tests.helpers import make_detail


class _Gateway:
    def __init__(self, responses: list[httpx.Response | Exception]) -> None:
        self.responses = responses
        self.headers: list[dict[str, str] | None] = []

    @asynccontextmanager
    async def stream(self, url: str, headers=None):
        self.headers.append(headers)
        response = self.responses.pop(0)
        if isinstance(response, Exception):
            raise response
        yield response


def _resource(
    kind: MediaKind = MediaKind.IMAGE,
    *,
    index: int = 1,
    suffix: str = "auto",
) -> MediaResource:
    return MediaResource(
        index=index,
        kind=kind,
        url=f"https://example.invalid/{kind.value}-{index}",
        suffix=suffix,
    )


def test_auto_suffix_follows_response_content_type() -> None:
    """确保 auto 图片格式采用响应声明的真实扩展名。"""
    suffix = FileDownloader._response_suffix("image/webp; charset=binary", "auto")

    assert suffix == "webp"
    assert FileDownloader._response_suffix("unknown", "auto") == "jpeg"
    assert FileDownloader._response_suffix("image/png", "avif") == "avif"


def test_unknown_partial_file_is_not_resumed(tmp_path: Path) -> None:
    """确保缺少 URL 指纹的临时文件不会被错误续传。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    part = tmp_path.joinpath("synthetic.part")
    marker = tmp_path.joinpath("synthetic.part.url")
    part.write_bytes(b"unknown source")

    FileDownloader._prepare_partial(part, marker, "https://example.invalid/media")

    assert not part.exists()
    assert len(marker.read_text(encoding="utf-8")) == 64


async def test_download_writes_atomic_artifact(tmp_path: Path) -> None:
    """确保响应内容原子落盘，并返回可校验的文件元数据。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    content = b"synthetic image"
    gateway = _Gateway(
        [httpx.Response(200, headers={"Content-Type": "image/webp"}, content=content)]
    )
    settings = AppSettings(work_path=tmp_path, max_retry=0)
    downloader = FileDownloader(settings, gateway)

    artifacts = await downloader.download(make_detail(media=[_resource()]))

    assert len(artifacts) == 1
    artifact = artifacts[0]
    target = settings.output_root.joinpath(artifact.path)
    assert target.suffix == ".webp"
    assert target.read_bytes() == content
    assert artifact.sha256 == sha256(content).hexdigest()
    assert not list(settings.temp_dir.glob("*"))


async def test_download_resumes_matching_partial_file(tmp_path: Path) -> None:
    """确保 URL 指纹匹配时从现有字节数继续下载。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    resource = _resource(suffix="jpeg")
    detail = make_detail(media=[resource])
    gateway = _Gateway([httpx.Response(206, content=b"-tail")])
    settings = AppSettings(work_path=tmp_path, max_retry=0)
    downloader = FileDownloader(settings, gateway)
    part, marker = downloader._partial_paths(detail, resource)
    downloader._prepare_partial(part, marker, resource.url)
    part.write_bytes(b"head")

    artifact = (await downloader.download(detail))[0]

    target = settings.output_root.joinpath(artifact.path)
    assert gateway.headers == [{"Range": "bytes=4-"}]
    assert target.read_bytes() == b"head-tail"


async def test_full_response_replaces_partial_file(tmp_path: Path) -> None:
    """确保服务器忽略 Range 时不会把完整响应追加到旧内容。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    resource = _resource(suffix="jpeg")
    detail = make_detail(media=[resource])
    gateway = _Gateway([httpx.Response(200, content=b"complete")])
    settings = AppSettings(work_path=tmp_path, max_retry=0)
    downloader = FileDownloader(settings, gateway)
    part, marker = downloader._partial_paths(detail, resource)
    downloader._prepare_partial(part, marker, resource.url)
    part.write_bytes(b"stale")

    artifact = (await downloader.download(detail))[0]

    assert settings.output_root.joinpath(artifact.path).read_bytes() == b"complete"


async def test_invalid_partial_state_is_removed(tmp_path: Path) -> None:
    """确保远端拒绝断点后清理无法继续使用的临时状态。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    resource = _resource()
    detail = make_detail(media=[resource])
    gateway = _Gateway([InvalidPartialContentError("invalid range")])
    settings = AppSettings(work_path=tmp_path, max_retry=0)
    downloader = FileDownloader(settings, gateway)
    part, marker = downloader._partial_paths(detail, resource)
    downloader._prepare_partial(part, marker, resource.url)
    part.write_bytes(b"stale")

    with pytest.raises(DownloadError, match="重试耗尽"):
        await downloader.download(detail)

    assert not part.exists()
    assert not marker.exists()


async def test_empty_response_is_rejected(tmp_path: Path) -> None:
    """确保零字节响应不会被视为成功产物。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    gateway = _Gateway([httpx.Response(200, content=b"")])
    downloader = FileDownloader(
        AppSettings(work_path=tmp_path, max_retry=0),
        gateway,
    )

    with pytest.raises(DownloadError, match="下载结果为空"):
        await downloader.download(make_detail(media=[_resource()]))


async def test_retry_recovers_after_download_failure(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """确保文件下载可在瞬时故障后恢复。

    Args:
        tmp_path: Pytest 提供的临时目录。
        monkeypatch: Pytest 提供的替换工具。
    """
    gateway = _Gateway(
        [
            DownloadError("temporary"),
            httpx.Response(200, content=b"recovered"),
        ]
    )
    settings = AppSettings(work_path=tmp_path, max_retry=1)
    downloader = FileDownloader(settings, gateway)

    async def no_sleep(delay: float) -> None:
        return None

    monkeypatch.setattr("src.infrastructure.downloader.sleep", no_sleep)
    artifacts = await downloader.download(make_detail(media=[_resource()]))

    assert artifacts[0].size == len(b"recovered")
    assert len(gateway.headers) == 2


async def test_download_filters_media_switches_and_indexes(tmp_path: Path) -> None:
    """确保类型开关和一基序号共同筛选下载资源。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    resources = [
        _resource(MediaKind.IMAGE, index=1),
        _resource(MediaKind.VIDEO, index=2, suffix="mp4"),
        _resource(MediaKind.LIVE, index=3, suffix="heic"),
    ]
    gateway = _Gateway([httpx.Response(200, content=b"video")])
    settings = AppSettings(
        work_path=tmp_path,
        image_download=False,
        video_download=True,
        live_download=False,
        max_retry=0,
    )
    downloader = FileDownloader(settings, gateway)

    artifacts = await downloader.download(
        make_detail(media=resources),
        indexes={2, 3},
    )

    assert [artifact.media_index for artifact in artifacts] == [2]


async def test_download_returns_empty_when_all_media_disabled(tmp_path: Path) -> None:
    """确保没有符合条件的资源时不发起网络请求。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    gateway = _Gateway([])
    settings = AppSettings(
        work_path=tmp_path,
        image_download=False,
        video_download=False,
        live_download=False,
    )

    result = await FileDownloader(settings, gateway).download(
        make_detail(media=[_resource()])
    )

    assert result == []
    assert gateway.headers == []
