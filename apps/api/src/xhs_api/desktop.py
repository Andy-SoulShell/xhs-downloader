"""面向普通用户的一体化桌面启动入口。"""

import asyncio
import os
import secrets
import webbrowser
from contextlib import suppress
from pathlib import Path
from typing import Annotated

import httpx
import typer
from filelock import FileLock, Timeout
from loguru import logger
from uvicorn import Config, Server
from xhs_adapters.config import AppSettings
from xhs_adapters.logging import configure_logging

from .app import create_api
from .desktop_control import create_desktop_control_router
from .desktop_error import show_startup_error
from .desktop_paths import prepare_desktop_paths
from .webui import mount_webui

_HOST = "127.0.0.1"


async def run_desktop(
    *,
    config_dir: Path | None = None,
    data_dir: Path | None = None,
    webui_dir: Path | None = None,
    port: int = 5556,
    open_browser: bool = True,
) -> None:
    """启动同源 API 与 WebUI，并按需打开系统浏览器。

    Args:
        config_dir: 可选的持久化配置目录。
        data_dir: 可选的持久化数据目录。
        webui_dir: 可选的 WebUI 构建目录。
        port: 本机服务端口。
        open_browser: 服务就绪后是否打开管理界面。

    Raises:
        RuntimeError: 端口已被其他服务占用或服务未能启动。
    """
    paths = prepare_desktop_paths(
        config_dir=config_dir,
        data_dir=data_dir,
        webui_dir=webui_dir,
    )
    configure_logging(
        "info",
        paths.data_dir.joinpath(".xhs-downloader", "logs", "desktop.log"),
    )
    instance_id = _load_or_create_instance_id(paths.config_file.parent)
    lock_path = paths.data_dir.joinpath(".xhs-downloader", "desktop.lock")
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    instance_lock = FileLock(lock_path)
    try:
        instance_lock.acquire(timeout=0)
    except Timeout as error:
        if await _wait_for_owned_service(port, instance_id):
            if open_browser:
                await asyncio.to_thread(
                    webbrowser.open,
                    f"http://{_HOST}:{port}/ui/",
                )
            return
        raise RuntimeError("桌面服务已在运行，但未能确认其本机端口") from error
    try:
        await _run_primary_instance(
            settings_file=paths.config_file,
            webui_dir=paths.webui_dir,
            port=port,
            instance_id=instance_id,
            open_browser=open_browser,
        )
    finally:
        instance_lock.release()


async def _run_primary_instance(
    *,
    settings_file: Path,
    webui_dir: Path,
    port: int,
    instance_id: str,
    open_browser: bool,
) -> None:
    url = f"http://{_HOST}:{port}/ui/"
    existing = await _probe_service(port, instance_id)
    if existing is True:
        if open_browser:
            await asyncio.to_thread(webbrowser.open, url)
        return
    if existing is False:
        raise RuntimeError(f"本机端口 {port} 已被其他程序占用")
    settings = AppSettings.from_env(
        settings_file,
        server_host=_HOST,
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
            host=_HOST,
            port=port,
            log_level=settings.log_level,
            log_config=None,
        )
    )
    loop = asyncio.get_running_loop()
    api.include_router(
        create_desktop_control_router(
            instance_id,
            lambda: loop.call_later(
                0.2,
                setattr,
                server,
                "should_exit",
                True,
            ),
        )
    )
    serving = asyncio.create_task(server.serve())
    while not server.started and not serving.done():
        await asyncio.wait({serving}, timeout=0.05)
    if not server.started:
        await serving
        raise RuntimeError("本地服务未能启动")
    if open_browser:
        await asyncio.to_thread(webbrowser.open, url)
    await serving


def main() -> None:
    """解析桌面启动参数并运行一体化服务。"""
    try:
        typer.run(_run)
    except Exception as error:
        message = _safe_startup_error(error)
        with suppress(Exception):
            logger.error("桌面启动失败：{}", message)
        show_startup_error(message)
        raise SystemExit(1) from error


def _run(
    config_dir: Annotated[
        Path | None,
        typer.Option("--config-dir", help="配置目录"),
    ] = None,
    data_dir: Annotated[
        Path | None,
        typer.Option("--data-dir", help="数据目录"),
    ] = None,
    webui_dir: Annotated[
        Path | None,
        typer.Option("--webui-dir", help="WebUI 构建目录"),
    ] = None,
    port: Annotated[
        int,
        typer.Option("--port", min=1, max=65535, help="本机服务端口"),
    ] = 5556,
    no_open: Annotated[
        bool,
        typer.Option("--no-open", help="不要自动打开浏览器"),
    ] = False,
) -> None:
    asyncio.run(
        run_desktop(
            config_dir=config_dir,
            data_dir=data_dir,
            webui_dir=webui_dir,
            port=port,
            open_browser=not no_open,
        )
    )


async def _probe_service(
    port: int,
    instance_id: str,
) -> bool | None:
    try:
        async with httpx.AsyncClient(timeout=0.6, trust_env=False) as client:
            health, info, webui, identity = await asyncio.gather(
                client.get(f"http://{_HOST}:{port}/health"),
                client.get(f"http://{_HOST}:{port}/"),
                client.get(f"http://{_HOST}:{port}/ui/"),
                client.get(f"http://{_HOST}:{port}/desktop/identity"),
            )
    except httpx.TransportError:
        return None
    if any(response.status_code != 200 for response in (health, info, webui, identity)):
        return False
    try:
        health_payload = health.json()
        info_payload = info.json()
        identity_payload = identity.json()
        return (
            isinstance(health_payload, dict)
            and isinstance(info_payload, dict)
            and isinstance(identity_payload, dict)
            and health_payload.get("status") == "ok"
            and info_payload.get("name") == "xhs-downloader"
            and identity_payload.get("instance_id") == instance_id
            and "text/html" in webui.headers.get("content-type", "")
        )
    except ValueError:
        return False


async def _wait_for_owned_service(
    port: int,
    instance_id: str,
) -> bool:
    deadline = asyncio.get_running_loop().time() + 8
    waiter = asyncio.Event()
    while asyncio.get_running_loop().time() < deadline:
        status = await _probe_service(port, instance_id)
        if status is not None:
            return status
        with suppress(TimeoutError):
            await asyncio.wait_for(waiter.wait(), timeout=0.1)
    return False


def _load_or_create_instance_id(config_dir: Path) -> str:
    path = config_dir.joinpath("desktop-instance-id")
    try:
        value = path.read_text(encoding="utf-8").strip()
    except FileNotFoundError:
        value = secrets.token_hex(16)
        try:
            descriptor = os.open(
                path,
                os.O_WRONLY | os.O_CREAT | os.O_EXCL,
                0o600,
            )
        except FileExistsError:
            return _load_or_create_instance_id(config_dir)
        try:
            os.write(descriptor, f"{value}\n".encode())
        finally:
            os.close(descriptor)
    if not value:
        raise RuntimeError("桌面实例标识文件为空，请删除后重试")
    return value


def _safe_startup_error(error: Exception) -> str:
    if isinstance(error, RuntimeError):
        return str(error)
    return "桌面服务启动失败，请检查配置文件和 desktop.log"


if __name__ == "__main__":
    main()
