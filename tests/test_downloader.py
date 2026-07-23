"""文件下载器边界行为测试。"""

from pathlib import Path

from src.infrastructure.downloader import FileDownloader


def test_auto_suffix_follows_response_content_type() -> None:
    """确保 auto 图片格式采用响应声明的真实扩展名。"""
    suffix = FileDownloader._response_suffix("image/webp; charset=binary", "auto")

    assert suffix == "webp"


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
