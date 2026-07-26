"""桌面服务的单次运行与重启循环。"""

import asyncio
from collections.abc import Callable
from pathlib import Path

from fastapi import FastAPI
from uvicorn import Config, Server
from xhs_adapters.config import AppSettings
from xhs_adapters.logging import configure_logging

from .app import create_api
from .desktop_control import create_desktop_control_router
from .webui import mount_webui


class DesktopExitRequest:
    """记录本次运行结束后应当退出还是重启。

    退出与重启都要等当前响应发出后再停止服务器，因此这里只登记意图，
    真正的停止由运行循环在服务器结束后处理。

    Attributes:
        restart: 结束后是否重新启动服务。
    """

    def __init__(self) -> None:
        self.restart = False


async def serve_desktop(
    *,
    settings_file: Path,
    webui_dir: Path,
    host: str,
    port: int,
    instance_id: str,
    on_ready: Callable[[bool], None],
) -> None:
    """运行桌面服务，并在收到重启请求时就地重启。

    重启不会退出进程，因此实例锁、端口占用和已经打开的管理界面都保持
    不变；新的服务器会重新读取配置文件，使需要重启才能生效的配置立即
    进入运行状态。

    Args:
        settings_file: 持久化配置文件路径。
        webui_dir: WebUI 构建目录。
        host: 本机监听地址。
        port: 本机服务端口。
        instance_id: 当前安装目录的随机实例标识。
        on_ready: 服务就绪回调，参数为本次是否首次启动。

    Raises:
        RuntimeError: 服务未能启动。
    """
    first_run = True
    while True:
        exit_request = DesktopExitRequest()
        settings = AppSettings.from_env(
            settings_file,
            server_host=host,
            server_port=port,
        )
        configure_logging(
            settings.log_level,
            settings.state_dir.joinpath("logs", "desktop.log"),
        )
        api = create_api(
            settings,
            settings_file=settings_file,
            settings_override_fields={"server_host", "server_port"},
        )
        mount_webui(api, webui_dir)
        server = Server(
            Config(
                api,
                host=host,
                port=port,
                log_level=settings.log_level,
                log_config=None,
            )
        )
        _mount_control(api, instance_id, server, exit_request)
        await _serve_once(server, on_ready, first_run)
        if not exit_request.restart:
            return
        first_run = False


def _mount_control(
    api: FastAPI,
    instance_id: str,
    server: Server,
    exit_request: DesktopExitRequest,
) -> None:
    loop = asyncio.get_running_loop()

    def stop(restart: bool) -> None:
        exit_request.restart = restart
        # 延迟停止: 确保当前响应先完整发出。
        loop.call_later(0.2, setattr, server, "should_exit", True)

    api.include_router(
        create_desktop_control_router(
            instance_id,
            lambda: stop(False),
            request_restart=lambda: stop(True),
        )
    )


async def _serve_once(
    server: Server,
    on_ready: Callable[[bool], None],
    first_run: bool,
) -> None:
    serving = asyncio.create_task(server.serve())
    while not server.started and not serving.done():
        await asyncio.wait({serving}, timeout=0.05)
    if not server.started:
        await serving
        raise RuntimeError("本地服务未能启动")
    on_ready(first_run)
    await serving
