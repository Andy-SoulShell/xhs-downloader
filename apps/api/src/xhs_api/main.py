"""HTTP API 命令行入口。"""

import asyncio
from pathlib import Path
from typing import Annotated

import typer
from xhs_adapters.config import AppSettings

from .app import run_api


def _run(
    env_file: Annotated[
        Path | None,
        typer.Option("--env-file", help="dotenv 配置文件"),
    ] = None,
    host: Annotated[str | None, typer.Option("--host", help="监听地址")] = None,
    port: Annotated[int | None, typer.Option("--port", help="监听端口")] = None,
) -> None:
    """启动 HTTP API。

    Args:
        env_file: dotenv 配置文件。
        host: 覆盖监听地址。
        port: 覆盖监听端口。
    """
    overrides = {
        key: value
        for key, value in {"server_host": host, "server_port": port}.items()
        if value is not None
    }
    settings_file = env_file or Path(".env")
    asyncio.run(
        run_api(
            AppSettings.from_env(settings_file, **overrides),
            settings_file,
            set(overrides),
        )
    )


def main() -> None:
    """解析命令行参数并启动 HTTP API。"""
    typer.run(_run)


if __name__ == "__main__":
    main()
