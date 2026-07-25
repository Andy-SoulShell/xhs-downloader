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
    port: Annotated[
        int | None,
        typer.Option("--port", help="MCP 监听端口，默认使用 API 端口加一"),
    ] = None,
    api_url: Annotated[
        str | None,
        typer.Option("--api-url", help="本机 FastAPI 地址"),
    ] = None,
) -> None:
    """启动 Streamable HTTP MCP 服务。

    Args:
        env_file: dotenv 配置文件。
        host: 覆盖监听地址。
        port: 覆盖 MCP 监听端口。
        api_url: 覆盖本机 FastAPI 地址。
    """
    asyncio.run(
        run_mcp(
            AppSettings.from_env(env_file),
            api_base_url=api_url,
            host=host,
            port=port,
        )
    )


def main() -> None:
    """解析命令行参数并启动 MCP 服务。"""
    typer.run(_run)


if __name__ == "__main__":
    main()
