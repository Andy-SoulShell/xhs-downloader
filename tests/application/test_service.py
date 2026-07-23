"""下载应用服务测试。"""

from pathlib import Path

from src.application.service import DownloadService
from src.config import AppSettings
from tests.application.helpers import (
    _Downloader,
    _Gateway,
    _Parser,
    _Repository,
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
    gateway = _Gateway(resolved_url=URL)
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
