"""专用 Chromium 进程、用户目录和本机 CDP 生命周期。"""

import asyncio
from pathlib import Path

from filelock import FileLock
from filelock import Timeout as FileLockTimeout
from xhs_core.domain import (
    ManagedBrowserError,
    ManagedBrowserState,
    ManagedBrowserStatus,
)
from xhs_core.domain.browser_ports import ManagedBrowserController

from .chromium_installation import find_chromium_executable
from .chromium_process import (
    ChromiumProcess,
    EndpointProbe,
    ProcessLauncher,
    build_launch_command,
    launch_process,
    probe_endpoint,
    read_active_port,
)
from .chromium_state import read_runtime_port, write_runtime_state
from .config import AppSettings


class ChromiumController(ManagedBrowserController):
    """管理一个使用专用持久化目录的 Chromium 进程。

    控制器通过操作系统文件锁保证同一用户目录只由一个服务实例启动，
    Chromium 自行分配 CDP 端口，服务只连接固定回环地址。
    """

    def __init__(
        self,
        settings: AppSettings,
        launcher: ProcessLauncher | None = None,
        endpoint_probe: EndpointProbe | None = None,
    ) -> None:
        """初始化控制器。

        Args:
            settings: 浏览器路径、超时和状态目录配置。
            launcher: 测试可替换的子进程启动函数。
            endpoint_probe: 测试可替换的 CDP 健康检查函数。
        """
        self._settings = settings
        self._launcher = launcher or launch_process
        self._endpoint_probe = endpoint_probe or probe_endpoint
        self._process: ChromiumProcess | None = None
        self._port: int | None = None
        self._state = ManagedBrowserState.STOPPED
        self._message = "受管浏览器尚未启动"
        self._operation_lock = asyncio.Lock()
        self._instance_lock = FileLock(str(self._lock_path))

    async def status(self) -> ManagedBrowserStatus:
        """读取浏览器安装、进程和 CDP 状态。

        Returns:
            不包含完整文件路径的脱敏状态。
        """
        executable = find_chromium_executable(self._settings.managed_browser_executable)
        if not executable:
            return self._snapshot(
                False,
                None,
                ManagedBrowserState.STOPPED,
                None,
                "未检测到可用的 Chrome 或 Chromium",
            )
        if self._process and self._process.returncode is not None:
            self._process = None
            self._port = None
            self._release_lock()
            self._state = ManagedBrowserState.ERROR
            self._message = "受管浏览器进程意外退出"
        if self._process and self._port:
            return self._snapshot(
                True,
                executable.name,
                self._state,
                self._port,
                self._message,
                owned_by_current_process=True,
            )
        external_port = await self._external_running_port()
        if external_port:
            return self._snapshot(
                True,
                executable.name,
                ManagedBrowserState.RUNNING,
                external_port,
                "受管浏览器正由另一个服务实例管理",
                owned_by_current_process=False,
            )
        return self._snapshot(
            True,
            executable.name,
            self._state,
            None,
            self._message,
        )

    async def start(self) -> ManagedBrowserStatus:
        """启动专用 Chromium 并等待本机 CDP 可连接。

        Returns:
            运行中的浏览器状态。

        Raises:
            ManagedBrowserError: 浏览器未安装、目录被占用或启动失败。
        """
        async with self._operation_lock:
            current = await self.status()
            if current.state is ManagedBrowserState.RUNNING:
                return current
            executable = find_chromium_executable(
                self._settings.managed_browser_executable
            )
            if not executable:
                raise ManagedBrowserError("未检测到可用的 Chrome 或 Chromium")
            self._prepare_directories()
            try:
                self._instance_lock.acquire(timeout=0)
            except FileLockTimeout as error:
                raise ManagedBrowserError(
                    "受管浏览器用户目录已由另一个服务实例占用"
                ) from error
            self._active_port_path.unlink(missing_ok=True)
            self._runtime_state_path.unlink(missing_ok=True)
            self._state = ManagedBrowserState.STARTING
            self._message = "正在启动专用浏览器"
            try:
                command = build_launch_command(
                    executable,
                    self._settings.managed_browser_profile_dir,
                    self._settings.managed_browser_headless,
                )
                self._process = await self._launcher(command)
                self._port = await self._wait_for_endpoint()
                self._write_runtime_state(executable.name)
                self._state = ManagedBrowserState.RUNNING
                self._message = "专用浏览器已启动，登录状态将保存在本机"
                return self._snapshot(
                    True,
                    executable.name,
                    self._state,
                    self._port,
                    self._message,
                    owned_by_current_process=True,
                )
            except Exception as error:
                await self._cleanup_failed_start()
                if isinstance(error, ManagedBrowserError):
                    raise
                raise ManagedBrowserError("专用浏览器启动失败") from error

    async def stop(self) -> ManagedBrowserStatus:
        """停止当前服务启动的 Chromium，同时保留登录资料。

        Returns:
            停止后的状态。

        Raises:
            ManagedBrowserError: 浏览器由其他服务实例管理。
        """
        async with self._operation_lock:
            if not self._process:
                if await self._external_running_port():
                    raise ManagedBrowserError(
                        "受管浏览器由另一个服务实例管理，不能从当前进程停止"
                    )
                self._reset_stopped()
                return await self.status()
            self._state = ManagedBrowserState.STOPPING
            self._message = "正在停止专用浏览器"
            await self._terminate_process()
            self._reset_stopped()
            return await self.status()

    async def close(self) -> None:
        """关闭当前服务持有的进程和单实例锁。"""
        if self._process:
            await self.stop()
        else:
            self._release_lock()

    def _prepare_directories(self) -> None:
        self._settings.managed_browser_profile_dir.mkdir(
            parents=True,
            exist_ok=True,
            mode=0o700,
        )
        self._settings.managed_browser_profile_dir.chmod(0o700)

    async def _wait_for_endpoint(self) -> int:
        loop = asyncio.get_running_loop()
        deadline = loop.time() + self._settings.managed_browser_startup_timeout
        while loop.time() < deadline:
            if self._process and self._process.returncode is not None:
                raise ManagedBrowserError("专用浏览器在启动阶段意外退出")
            port = read_active_port(self._active_port_path)
            if port and await self._endpoint_probe(port):
                return port
            await asyncio.sleep(0.1)
        raise ManagedBrowserError("等待专用浏览器启动超时")

    async def _terminate_process(self) -> None:
        process = self._process
        if not process:
            return
        if process.returncode is None:
            process.terminate()
            try:
                await asyncio.wait_for(
                    process.wait(),
                    self._settings.managed_browser_shutdown_timeout,
                )
            except TimeoutError:
                process.kill()
                await process.wait()

    async def _cleanup_failed_start(self) -> None:
        await self._terminate_process()
        self._process = None
        self._port = None
        self._state = ManagedBrowserState.ERROR
        self._message = "专用浏览器启动失败"
        self._runtime_state_path.unlink(missing_ok=True)
        self._release_lock()

    async def _external_running_port(self) -> int | None:
        port = read_runtime_port(self._runtime_state_path)
        if not port:
            return None
        return port if await self._endpoint_probe(port) else None

    def _write_runtime_state(self, executable_name: str) -> None:
        if not self._process or not self._port:
            raise ManagedBrowserError("浏览器运行状态不完整")
        write_runtime_state(
            self._runtime_state_path,
            self._process.pid,
            self._port,
            executable_name,
        )

    def _reset_stopped(self) -> None:
        self._process = None
        self._port = None
        self._state = ManagedBrowserState.STOPPED
        self._message = "受管浏览器已停止，登录资料仍保存在本机"
        self._runtime_state_path.unlink(missing_ok=True)
        self._active_port_path.unlink(missing_ok=True)
        self._release_lock()

    def _release_lock(self) -> None:
        if self._instance_lock.is_locked:
            self._instance_lock.release()

    def _snapshot(
        self,
        installed: bool,
        executable_name: str | None,
        state: ManagedBrowserState,
        port: int | None,
        message: str,
        *,
        owned_by_current_process: bool = False,
    ) -> ManagedBrowserStatus:
        return ManagedBrowserStatus(
            installed=installed,
            state=state,
            executable_name=executable_name,
            cdp_port=port,
            owned_by_current_process=owned_by_current_process,
            message=message,
        )

    @property
    def _lock_path(self) -> Path:
        return self._settings.managed_browser_dir.joinpath("instance.lock")

    @property
    def _runtime_state_path(self) -> Path:
        return self._settings.managed_browser_dir.joinpath("runtime.json")

    @property
    def _active_port_path(self) -> Path:
        return self._settings.managed_browser_profile_dir.joinpath("DevToolsActivePort")
