"""MCP 服务命令行入口。"""

import asyncio
from pathlib import Path
from typing import Annotated

import typer
from xhs_adapters.config import AppSettings

from .server import run_mcp


def _run(
    env_file: Annotated[
        Path | None,
        typer.Option("--env-file", help="dotenv 配置文件"),
    ] = None,
    host: Annotated[str | None, typer.Option("--host", help="监听地址")] = None,
    port: Annotated[int | None, typer.Option("--port", help="监听端口")] = None,
) -> None:
    """启动 Streamable HTTP MCP 服务。

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
    asyncio.run(run_mcp(AppSettings.from_env(env_file, **overrides)))


def main() -> None:
    """解析命令行参数并启动 MCP 服务。"""
    typer.run(_run)


if __name__ == "__main__":
    main()
