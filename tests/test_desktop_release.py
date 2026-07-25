"""桌面发布归档测试。"""

import os
import stat
from pathlib import Path
from zipfile import ZipFile

import pytest

from scripts.release_archives import verify_archive_contents, zip_tree


def test_release_archive_preserves_symlinks_and_root_name(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """确保 macOS 应用链接不会在压缩时被展开。

    Args:
        tmp_path: Pytest 提供的临时目录。
        monkeypatch: Pytest 提供的属性替换工具。
    """
    source = tmp_path.joinpath("source")
    source.mkdir()
    source.joinpath("target.txt").write_text("合成资源", encoding="utf-8")
    link_path = source.joinpath("link.txt")
    try:
        link_path.symlink_to("target.txt")
    except OSError as error:
        if getattr(error, "winerror", None) != 1314:
            raise
        _simulate_symlink_without_windows_privilege(link_path, monkeypatch)
    archive_path = tmp_path.joinpath("release.zip")

    zip_tree(
        source,
        archive_path,
        root_name="synthetic-package",
    )

    with ZipFile(archive_path) as archive:
        link = archive.getinfo("synthetic-package/link.txt")
        mode = link.external_attr >> 16
        assert stat.S_ISLNK(mode)
        assert archive.read(link) == b"target.txt"
        assert archive.read("synthetic-package/target.txt").decode() == "合成资源"


def _simulate_symlink_without_windows_privilege(
    link_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    link_path.write_text("synthetic-link-placeholder", encoding="utf-8")
    original_is_symlink = Path.is_symlink
    original_lstat = Path.lstat
    original_readlink = os.readlink

    def is_symlink(path: Path) -> bool:
        return path == link_path or original_is_symlink(path)

    def lstat(path: Path):
        metadata = original_lstat(path)
        if path != link_path:
            return metadata
        values = list(metadata)
        values[0] = stat.S_IFLNK | 0o777
        return os.stat_result(values)

    def readlink(path: os.PathLike[str] | str, *, dir_fd=None) -> str:
        if Path(path) == link_path:
            return "target.txt"
        return original_readlink(path, dir_fd=dir_fd)

    monkeypatch.setattr(Path, "is_symlink", is_symlink)
    monkeypatch.setattr(Path, "lstat", lstat)
    monkeypatch.setattr(os, "readlink", readlink)


def test_release_archive_rejects_persistent_logs(tmp_path) -> None:
    """确保发布包不会带入桌面运行日志。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    source = tmp_path.joinpath("source")
    source.mkdir()
    source.joinpath("desktop.log").write_text("合成日志", encoding="utf-8")
    desktop = tmp_path.joinpath("desktop.zip")
    extension = tmp_path.joinpath("extension.zip")
    zip_tree(source, desktop)
    source.joinpath("desktop.log").unlink()
    source.joinpath("manifest.json").write_text("{}", encoding="utf-8")
    zip_tree(source, extension)

    try:
        verify_archive_contents(desktop, extension)
    except RuntimeError as error:
        assert "用户数据路径" in str(error)
    else:
        raise AssertionError("包含日志的发布归档必须被拒绝")
