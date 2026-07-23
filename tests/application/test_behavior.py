"""下载应用服务行为测试。"""

from pathlib import Path

from src.application.service import DownloadService
from src.config import AppSettings
from tests.application.helpers import _Downloader, _Gateway, _Parser, _Repository

URL = "https://www.xiaohongshu.com/explore/synthetic-work"


def _service(
    settings: AppSettings,
    gateway: _Gateway,
    downloader: _Downloader,
    repository: _Repository,
) -> DownloadService:
    return DownloadService(
        settings,
        gateway,
        _Parser(),
        downloader,
        repository,
    )


async def test_service_manages_gateway_and_applies_author_mapping(
    tmp_path: Path,
) -> None:
    """确保服务管理网关生命周期并应用作者名称映射。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    settings = AppSettings(
        work_path=tmp_path,
        mapping_data={"synthetic-author": "映射后的作者"},
    )
    gateway = _Gateway()
    service = _service(
        settings,
        gateway,
        _Downloader(settings),
        _Repository(),
    )

    async with service:
        detail = await service.get_detail(URL, cookie="session=synthetic")
        assert gateway.entered

    assert gateway.closed
    assert gateway.cookie == "session=synthetic"
    assert detail.author.nickname == "映射后的作者"


async def test_force_download_bypasses_valid_record(tmp_path: Path) -> None:
    """确保强制下载不会复用完整的本地产物。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    settings = AppSettings(work_path=tmp_path)
    downloader = _Downloader(settings)
    repository = _Repository()
    service = _service(settings, _Gateway(), downloader, repository)
    await service.download(URL)

    outcome = await service.download(URL, indexes={1}, force=True)

    assert not outcome.skipped
    assert downloader.calls == 2
    assert downloader.indexes == {1}
    assert repository.saved == 2


async def test_metadata_is_saved_without_media_artifacts(tmp_path: Path) -> None:
    """确保仅保存详情时返回准确消息且不创建空下载记录。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    settings = AppSettings(
        work_path=tmp_path,
        record_data=True,
        download_record=True,
    )
    repository = _Repository()
    service = _service(
        settings,
        _Gateway(),
        _Downloader(settings, produce_artifacts=False),
        repository,
    )

    outcome = await service.download(URL)

    metadata = settings.state_dir.joinpath("metadata/synthetic-work.json")
    assert outcome.message == "没有符合当前配置的媒体文件"
    assert metadata.is_file()
    assert '"作品ID": "synthetic-work"' in metadata.read_text(encoding="utf-8")
    assert repository.saved == 0


async def test_same_size_file_corruption_invalidates_record(tmp_path: Path) -> None:
    """确保文件大小未变但哈希变化时仍会重新下载。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    settings = AppSettings(work_path=tmp_path)
    downloader = _Downloader(settings)
    service = _service(settings, _Gateway(), downloader, _Repository())
    first = await service.download(URL)
    target = settings.output_root.joinpath(first.artifacts[0].path)
    target.write_bytes(b"x" * first.artifacts[0].size)

    outcome = await service.download(URL)

    assert not outcome.skipped
    assert downloader.calls == 2


async def test_unsafe_record_path_is_never_reused(tmp_path: Path) -> None:
    """确保下载记录无法通过相对路径逃逸数据根目录。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    settings = AppSettings(work_path=tmp_path)
    downloader = _Downloader(settings)
    repository = _Repository()
    service = _service(settings, _Gateway(), downloader, repository)
    await service.download(URL)
    assert repository.record is not None
    repository.record.artifacts[0].path = "../outside.mp4"

    outcome = await service.download(URL)

    assert not outcome.skipped
    assert downloader.calls == 2
