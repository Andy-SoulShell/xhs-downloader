"""集中配置用例测试。"""

import asyncio
from collections.abc import Callable
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
        AppSettings(_env_file=None),
        env_file,
        DotenvSettingsRepository(env_file),
        {},
    )

    with pytest.raises(SettingsError, match="媒体目录必须是单段有效名称"):
        await manager.update({"folder_name": "../outside"})

    assert not env_file.exists()


async def test_settings_manager_hot_applies_network_and_route_fields(
    tmp_path: Path,
) -> None:
    """确保网络与只读路由配置排空替换后无需重启。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    applied: list[AppSettings] = []

    async def apply_runtime(
        settings: AppSettings,
        commit: Callable[[], None],
    ) -> None:
        applied.append(settings)
        commit()

    env_file = tmp_path.joinpath(".env")
    manager = SettingsManager(
        AppSettings(_env_file=None),
        env_file,
        DotenvSettingsRepository(env_file),
        {},
        apply_runtime=apply_runtime,
    )

    snapshot = await manager.update(
        {
            "timeout": 30,
            "cookie": "session=synthetic",
            "route_strategy": "http_first",
            "browser_driver": "managed",
        }
    )

    assert len(applied) == 1
    assert applied[0].timeout == 30
    assert applied[0].cookie.get_secret_value() == "session=synthetic"
    assert manager.current.browser_driver.value == "managed"
    assert snapshot.restart_required is False


async def test_settings_manager_keeps_cold_fields_for_restart(tmp_path: Path) -> None:
    """确保混合保存时只热应用安全字段并保留其余重启提示。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    applied: list[AppSettings] = []

    async def apply_runtime(
        settings: AppSettings,
        commit: Callable[[], None],
    ) -> None:
        applied.append(settings)
        commit()

    env_file = tmp_path.joinpath(".env")
    manager = SettingsManager(
        AppSettings(_env_file=None),
        env_file,
        DotenvSettingsRepository(env_file),
        {},
        apply_runtime=apply_runtime,
    )

    snapshot = await manager.update(
        {
            "timeout": 30,
            "folder_name": "media",
        }
    )

    assert applied[0].timeout == 30
    assert applied[0].folder_name == AppSettings(_env_file=None).folder_name
    assert manager.current.timeout == 30
    assert snapshot.values.folder_name == "media"
    assert snapshot.restart_required is True


async def test_settings_manager_reports_saved_hot_reload_failure(
    tmp_path: Path,
) -> None:
    """确保热替换失败时保留旧运行时并给出明确重启提示。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """

    async def fail_runtime(
        _: AppSettings,
        __: Callable[[], None],
    ) -> None:
        raise RuntimeError("synthetic replacement failure")

    env_file = tmp_path.joinpath(".env")
    manager = SettingsManager(
        AppSettings(_env_file=None),
        env_file,
        DotenvSettingsRepository(env_file),
        {},
        apply_runtime=fail_runtime,
    )

    with pytest.raises(SettingsError, match=r"配置已保存.*重启"):
        await manager.update({"timeout": 30})

    assert manager.current.timeout == 15
    assert "XHS_TIMEOUT=30" in env_file.read_text(encoding="utf-8")


async def test_settings_manager_keeps_state_consistent_after_committed_cancel(
    tmp_path: Path,
) -> None:
    """确保运行时提交后的请求取消不会留下新旧配置不一致。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    committed = asyncio.Event()

    async def apply_runtime(
        _: AppSettings,
        commit: Callable[[], None],
    ) -> None:
        commit()
        committed.set()
        await asyncio.Event().wait()

    env_file = tmp_path.joinpath(".env")
    manager = SettingsManager(
        AppSettings(_env_file=None),
        env_file,
        DotenvSettingsRepository(env_file),
        {},
        apply_runtime=apply_runtime,
    )
    updating = asyncio.create_task(manager.update({"timeout": 30}))

    await committed.wait()
    updating.cancel()
    with pytest.raises(asyncio.CancelledError):
        await updating

    assert manager.current.timeout == 30
    snapshot = await manager.get()
    assert snapshot.restart_required is False


async def test_runtime_overrides_never_require_restart(tmp_path: Path) -> None:
    """确保启动参数强制覆盖的字段不会让界面永远提示需要重启。

    桌面模式用命令行指定监听端口，配置文件中仍是默认值；重启并不能让
    文件里的值生效，因此这类差异不应计入重启判定。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    env_file = tmp_path.joinpath(".env")
    env_file.write_text("", encoding="utf-8")
    manager = SettingsManager(
        AppSettings(server_port=5591),
        env_file,
        DotenvSettingsRepository(env_file),
        {},
        {"server_port"},
    )

    assert not (await manager.get()).restart_required

    await manager.update({"folder_name": "synthetic-media"})

    assert (await manager.get()).restart_required
