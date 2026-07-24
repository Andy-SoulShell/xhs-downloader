"""集中配置用例测试。"""

from pathlib import Path

import pytest
from xhs_adapters.config import AppSettings
from xhs_adapters.settings_repository import DotenvSettingsRepository
from xhs_api.settings_service import SettingsManager
from xhs_core.domain import SettingsError


async def test_settings_manager_tracks_restart_and_environment_overrides(
    tmp_path: Path,
) -> None:
    """确保保存后的配置标记重启需求并识别进程环境覆盖。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    env_file = tmp_path.joinpath(".env")
    env_file.write_text("XHS_TIMEOUT=15\n", encoding="utf-8")
    manager = SettingsManager(
        AppSettings(),
        env_file,
        DotenvSettingsRepository(env_file),
        {"XHS_TIMEOUT": "45"},
    )

    snapshot = await manager.update(
        {
            "timeout": 30,
            "cookie": "session=synthetic",
            "proxy": "http://127.0.0.1:7890",
        }
    )

    assert snapshot.restart_required is True
    assert snapshot.cookie_configured is True
    assert snapshot.proxy_configured is True
    assert snapshot.overridden_fields == ("timeout",)
    assert snapshot.values.timeout == 30


async def test_settings_manager_rejects_invalid_combination(tmp_path: Path) -> None:
    """确保跨目录文件夹名称不会写入配置。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    env_file = tmp_path.joinpath(".env")
    manager = SettingsManager(
        AppSettings(),
        env_file,
        DotenvSettingsRepository(env_file),
        {},
    )

    with pytest.raises(SettingsError, match="媒体目录必须是单段有效名称"):
        await manager.update({"folder_name": "../outside"})

    assert not env_file.exists()
