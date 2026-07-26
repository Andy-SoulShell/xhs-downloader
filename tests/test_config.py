"""配置加载测试。"""

from pathlib import Path

import pytest
from pydantic import ValidationError
from xhs_adapters.config import DEFAULT_USER_AGENT, AppSettings, ImageFormat
from xhs_core.domain import BrowserDriver, RouteStrategy


def test_environment_overrides_dotenv(
    tmp_path: Path,
    monkeypatch,
) -> None:
    """确保进程环境优先于 dotenv 文件。

    Args:
        tmp_path: Pytest 提供的临时目录。
        monkeypatch: Pytest 提供的环境变量隔离工具。
    """
    env_file = tmp_path.joinpath(".env")
    env_file.write_text(
        "XHS_TIMEOUT=20\nXHS_IMAGE_FORMAT=png\nXHS_WORK_PATH=\n",
        encoding="utf-8",
    )
    monkeypatch.setenv("XHS_TIMEOUT", "30")

    settings = AppSettings.from_env(env_file)

    assert settings.timeout == 30
    assert settings.image_format is ImageFormat.PNG
    assert settings.work_path is None


def test_server_listens_on_loopback_by_default(tmp_path: Path) -> None:
    """确保未显式配置监听地址时服务只对本机开放。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    settings = AppSettings(work_path=tmp_path)

    assert settings.server_host == "127.0.0.1"


def test_output_paths_share_one_root(tmp_path: Path) -> None:
    """确保下载记录不会跨越自定义数据根目录。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    settings = AppSettings(work_path=tmp_path)

    assert settings.download_dir == tmp_path.joinpath("download")
    assert settings.state_dir == tmp_path.joinpath(".xhs-downloader")
    assert settings.temp_dir.is_relative_to(tmp_path)


def test_empty_user_agent_uses_default() -> None:
    """确保示例配置中的空 User-Agent 不会覆盖安全默认值。"""
    settings = AppSettings(user_agent="")

    assert settings.user_agent == DEFAULT_USER_AGENT


def test_folder_name_cannot_escape_output_root() -> None:
    """确保媒体目录配置不能包含父目录跳转。"""
    with pytest.raises(ValidationError, match="媒体目录必须是单段有效名称"):
        AppSettings(folder_name="../outside")


def test_access_mode_defaults_and_environment_values(tmp_path: Path) -> None:
    """确保访问模式保持兼容默认值并可由 dotenv 配置。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    defaults = AppSettings()
    env_file = tmp_path.joinpath(".env")
    env_file.write_text(
        "XHS_ROUTE_STRATEGY=http_first\nXHS_BROWSER_DRIVER=managed\n",
        encoding="utf-8",
    )

    configured = AppSettings.from_env(env_file)

    assert defaults.route_strategy is RouteStrategy.BROWSER_ONLY
    assert defaults.browser_driver is BrowserDriver.EXTENSION
    assert configured.route_strategy is RouteStrategy.HTTP_FIRST
    assert configured.browser_driver is BrowserDriver.MANAGED
