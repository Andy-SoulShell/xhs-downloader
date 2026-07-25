"""桌面发布归档测试。"""

import stat
from zipfile import ZipFile

from scripts.release_archives import verify_archive_contents, zip_tree


def test_release_archive_preserves_symlinks_and_root_name(tmp_path) -> None:
    """确保 macOS 应用链接不会在压缩时被展开。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    source = tmp_path.joinpath("source")
    source.mkdir()
    source.joinpath("target.txt").write_text("合成资源", encoding="utf-8")
    source.joinpath("link.txt").symlink_to("target.txt")
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
