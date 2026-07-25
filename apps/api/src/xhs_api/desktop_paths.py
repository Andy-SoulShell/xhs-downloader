"""桌面包的持久化目录与内置资源定位。"""

import sys
from dataclasses import dataclass
from pathlib import Path

from platformdirs import user_config_path, user_data_path
from xhs_adapters.settings_repository import DotenvSettingsRepository

_APP_NAME = "xhs-downloader"


@dataclass(frozen=True, slots=True)
class DesktopPaths:
    """桌面运行所需的持久化路径。

    Attributes:
        config_file: 跨版本保留的 dotenv 配置文件。
        data_dir: 下载、数据库与受管浏览器资料目录。
        webui_dir: 当前程序包内的 WebUI 生产资源。
    """

    config_file: Path
    data_dir: Path
    webui_dir: Path


def prepare_desktop_paths(
    *,
    config_dir: Path | None = None,
    data_dir: Path | None = None,
    webui_dir: Path | None = None,
) -> DesktopPaths:
    """创建跨版本保留的桌面目录并定位 WebUI。

    Args:
        config_dir: 可选配置目录覆盖值。
        data_dir: 可选数据目录覆盖值。
        webui_dir: 可选 WebUI 构建目录覆盖值。

    Returns:
        已解析并完成首次运行初始化的路径。
    """
    resolved_config = (
        (config_dir or user_config_path(_APP_NAME, appauthor=False))
        .expanduser()
        .resolve()
    )
    resolved_data = (
        (data_dir or user_data_path(_APP_NAME, appauthor=False)).expanduser().resolve()
    )
    resolved_config.mkdir(parents=True, exist_ok=True)
    resolved_data.mkdir(parents=True, exist_ok=True)
    config_file = resolved_config.joinpath(".env")
    if not config_file.exists():
        DotenvSettingsRepository(config_file).save(
            {
                "work_path": resolved_data,
                "server_host": "127.0.0.1",
                "server_port": 5556,
            }
        )
    return DesktopPaths(
        config_file=config_file,
        data_dir=resolved_data,
        webui_dir=_resolve_webui_dir(webui_dir),
    )


def _resolve_webui_dir(explicit: Path | None) -> Path:
    if explicit is not None:
        return explicit.expanduser().resolve()
    bundle_root = getattr(sys, "_MEIPASS", None)
    if bundle_root:
        return Path(bundle_root).joinpath("webui").resolve()
    repository_root = Path(__file__).resolve().parents[4]
    return repository_root.joinpath("apps", "webui", "dist")
