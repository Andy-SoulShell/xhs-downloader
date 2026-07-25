"""受管 Chromium 生命周期基础设施测试。"""

from collections.abc import Sequence
from pathlib import Path

import pytest
from xhs_adapters.chromium_installation import find_chromium_executable
from xhs_adapters.config import AppSettings
from xhs_adapters.managed_browser import ChromiumController
from xhs_core.domain import ManagedBrowserError, ManagedBrowserState


class FakeChromiumProcess:
    """记录终止动作的合成 Chromium 进程。"""

    pid = 4242

    def __init__(self) -> None:
        """创建仍在运行的合成进程。"""
        self.returncode: int | None = None
        self.terminated = False
        self.killed = False

    async def wait(self) -> int:
        """返回合成退出码。

        Returns:
            当前退出码；尚未设置时按正常退出处理。
        """
        return self.returncode or 0

    def terminate(self) -> None:
        """记录正常终止并设置退出码。"""
        self.terminated = True
        self.returncode = 0

    def kill(self) -> None:
        """记录强制终止并设置退出码。"""
        self.killed = True
        self.returncode = -9


def _executable(tmp_path: Path) -> Path:
    executable = tmp_path.joinpath("synthetic-chromium")
    executable.touch(mode=0o700)
    return executable


def _launcher(
    process: FakeChromiumProcess,
    commands: list[tuple[str, ...]],
):
    async def launch(command: Sequence[str]) -> FakeChromiumProcess:
        commands.append(tuple(command))
        profile_arg = next(
            item for item in command if item.startswith("--user-data-dir=")
        )
        profile = Path(profile_arg.partition("=")[2])
        profile.joinpath("DevToolsActivePort").write_text(
            "9222\n/devtools/browser/synthetic\n",
            encoding="utf-8",
        )
        return process

    return launch


async def _healthy(port: int) -> bool:
    return port == 9222


async def test_managed_browser_starts_once_and_preserves_profile(
    tmp_path: Path,
) -> None:
    """确保专用目录、随机端口、幂等启动和安全停止共同生效。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    process = FakeChromiumProcess()
    commands: list[tuple[str, ...]] = []
    settings = AppSettings(
        work_path=tmp_path,
        managed_browser_executable=_executable(tmp_path),
    )
    controller = ChromiumController(
        settings,
        launcher=_launcher(process, commands),
        endpoint_probe=_healthy,
    )

    started = await controller.start()
    repeated = await controller.start()
    stopped = await controller.stop()

    assert started.state is ManagedBrowserState.RUNNING
    assert started.cdp_host == "127.0.0.1"
    assert started.cdp_port == 9222
    assert repeated == started
    assert len(commands) == 1
    assert "--remote-debugging-address=127.0.0.1" in commands[0]
    assert "--remote-debugging-port=0" in commands[0]
    assert str(settings.managed_browser_profile_dir) in " ".join(commands[0])
    assert stopped.state is ManagedBrowserState.STOPPED
    assert process.terminated is True
    assert settings.managed_browser_profile_dir.exists()
    assert not settings.managed_browser_dir.joinpath("runtime.json").exists()


async def test_managed_browser_does_not_take_over_external_instance(
    tmp_path: Path,
) -> None:
    """确保第二个控制器复用状态但不能终止其他实例。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    settings = AppSettings(
        work_path=tmp_path,
        managed_browser_executable=_executable(tmp_path),
    )
    first_process = FakeChromiumProcess()
    first = ChromiumController(
        settings,
        launcher=_launcher(first_process, []),
        endpoint_probe=_healthy,
    )
    second_commands: list[tuple[str, ...]] = []
    second = ChromiumController(
        settings,
        launcher=_launcher(FakeChromiumProcess(), second_commands),
        endpoint_probe=_healthy,
    )
    await first.start()

    observed = await second.start()

    assert observed.state is ManagedBrowserState.RUNNING
    assert "另一个服务实例" in observed.message
    assert second_commands == []
    with pytest.raises(ManagedBrowserError, match="另一个服务实例"):
        await second.stop()
    await first.stop()


async def test_managed_browser_reports_missing_explicit_executable(
    tmp_path: Path,
) -> None:
    """确保无效显式路径不会静默改用另一款浏览器。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    missing = tmp_path.joinpath("missing-chromium")
    controller = ChromiumController(
        AppSettings(
            work_path=tmp_path,
            managed_browser_executable=missing,
        )
    )

    status = await controller.status()

    assert find_chromium_executable(missing) is None
    assert status.installed is False
    with pytest.raises(ManagedBrowserError, match="未检测到"):
        await controller.start()


async def test_managed_browser_releases_lock_after_startup_failure(
    tmp_path: Path,
) -> None:
    """确保启动超时后清理进程和单实例锁。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    process = FakeChromiumProcess()
    settings = AppSettings(
        work_path=tmp_path,
        managed_browser_executable=_executable(tmp_path),
        managed_browser_startup_timeout=0.11,
    )

    async def unavailable(_: int) -> bool:
        return False

    controller = ChromiumController(
        settings,
        launcher=_launcher(process, []),
        endpoint_probe=unavailable,
    )

    with pytest.raises(ManagedBrowserError, match="超时"):
        await controller.start()

    assert process.terminated is True
    assert controller._instance_lock.is_locked is False
    assert (await controller.status()).state is ManagedBrowserState.ERROR


async def test_managed_browser_restarts_after_unexpected_exit(
    tmp_path: Path,
) -> None:
    """确保进程异常退出后释放旧锁并可使用同一专用 Profile 恢复。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    first = FakeChromiumProcess()
    second = FakeChromiumProcess()
    processes = [first, second]
    launched: list[FakeChromiumProcess] = []
    settings = AppSettings(
        work_path=tmp_path,
        managed_browser_executable=_executable(tmp_path),
    )

    async def launch(command: Sequence[str]) -> FakeChromiumProcess:
        process = processes[len(launched)]
        launched.append(process)
        profile_arg = next(
            item for item in command if item.startswith("--user-data-dir=")
        )
        profile = Path(profile_arg.partition("=")[2])
        profile.joinpath("DevToolsActivePort").write_text(
            "9222\n/devtools/browser/synthetic\n",
            encoding="utf-8",
        )
        return process

    async def healthy(port: int) -> bool:
        return port == 9222 and any(process.returncode is None for process in launched)

    controller = ChromiumController(
        settings,
        launcher=launch,
        endpoint_probe=healthy,
    )
    await controller.start()
    first.returncode = 1

    crashed = await controller.status()
    recovered = await controller.start()

    assert crashed.state is ManagedBrowserState.ERROR
    assert recovered.state is ManagedBrowserState.RUNNING
    assert launched == [first, second]
    assert controller._instance_lock.is_locked is True
    await controller.stop()
