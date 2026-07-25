"""跨平台桌面归档、解压与用户数据边界。"""

import os
import platform
import stat
import subprocess
import sys
import tarfile
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo


def desktop_archive_name(version: str) -> str:
    """生成包含版本、系统和架构的桌面归档名称。

    Args:
        version: 应用语义版本。

    Returns:
        当前平台使用的版本化归档文件名。
    """
    suffix = ".zip" if sys.platform in {"darwin", "win32"} else ".tar.gz"
    return f"xhs-downloader-{version}-{platform_tag()}{suffix}"


def platform_tag() -> str:
    """返回发布清单使用的系统与架构标识。

    Returns:
        例如 ``darwin-arm64`` 或 ``win32-amd64``。
    """
    machine = platform.machine().lower() or "unknown"
    return f"{sys.platform}-{machine}"


def archive_desktop(source: Path, target: Path) -> None:
    """保留当前平台必要元数据并归档桌面程序。

    Args:
        source: PyInstaller 生成的应用或一目录程序。
        target: 需要生成的 ZIP 或 tar.gz 路径。
    """
    target.unlink(missing_ok=True)
    if sys.platform == "darwin":
        _run(
            [
                "ditto",
                "-c",
                "-k",
                "--sequesterRsrc",
                "--keepParent",
                str(source),
                str(target),
            ]
        )
    elif sys.platform == "win32":
        zip_tree(source, target)
    else:
        with tarfile.open(target, "w:gz", dereference=False) as archive:
            archive.add(source, arcname=source.name, recursive=True)


def extract_desktop_archive(
    archive: Path,
    destination: Path,
) -> tuple[Path, Path | None]:
    """解压最终归档并返回可执行文件和可选 macOS 应用。

    Args:
        archive: 最终桌面归档。
        destination: 空的临时解压目录。

    Returns:
        可执行文件，以及 macOS 下用于验签的 ``.app``。
    """
    if sys.platform == "darwin":
        _run(["ditto", "-x", "-k", str(archive), str(destination)])
        bundle = destination.joinpath("xhs-downloader.app")
        return (
            bundle.joinpath("Contents", "MacOS", "xhs-downloader"),
            bundle,
        )
    if sys.platform == "win32":
        with ZipFile(archive) as packaged:
            packaged.extractall(destination)
        return (
            destination.joinpath("xhs-downloader", "xhs-downloader.exe"),
            None,
        )
    with tarfile.open(archive, "r:gz") as packaged:
        packaged.extractall(destination, filter="data")
    return destination.joinpath("xhs-downloader", "xhs-downloader"), None


def zip_tree(
    source: Path,
    target: Path,
    *,
    root_name: str | None = None,
) -> None:
    """生成保留 Unix 符号链接与权限的 ZIP。

    Args:
        source: 需要归档的目录。
        target: 目标 ZIP。
        root_name: 可选的归档顶层目录名称。
    """
    target.unlink(missing_ok=True)
    with ZipFile(target, "w", ZIP_DEFLATED, compresslevel=9) as archive:
        for path in sorted(source.rglob("*")):
            relative = path.relative_to(source)
            archive_path = Path(root_name or source.name).joinpath(relative)
            if path.is_symlink():
                info = ZipInfo.from_file(path, archive_path)
                info.create_system = 3
                info.external_attr = (stat.S_IFLNK | path.lstat().st_mode & 0o777) << 16
                archive.writestr(info, os.readlink(path))
            elif path.is_file():
                archive.write(path, archive_path)


def verify_archive_contents(desktop: Path, extension: Path) -> None:
    """拒绝包含用户配置、数据库或浏览器 Profile 的发布归档。

    Args:
        desktop: 桌面程序归档。
        extension: 浏览器扩展归档。

    Raises:
        RuntimeError: 归档成员命中用户数据路径。
    """
    names = _archive_names(desktop)
    names.extend(_archive_names(extension))
    leaked = [name for name in names if _looks_like_user_data(name)]
    if leaked:
        raise RuntimeError(f"发布归档包含用户数据路径：{leaked[:3]}")


def _archive_names(path: Path) -> list[str]:
    if path.suffix == ".zip":
        with ZipFile(path) as archive:
            return archive.namelist()
    with tarfile.open(path, "r:gz") as archive:
        return archive.getnames()


def _looks_like_user_data(name: str) -> bool:
    path = Path(name)
    parts = {part.casefold() for part in path.parts}
    forbidden_parts = {
        ".env",
        ".xhs-downloader",
        "logs",
        "managed-browser",
        "profiles",
        "volume",
    }
    return bool(
        forbidden_parts.intersection(parts)
        or path.suffix.casefold() in {".db", ".log", ".sqlite", ".sqlite3"}
    )


def _run(command: list[str]) -> None:
    subprocess.run(command, check=True)
