"""基于 Typer 的中文命令行接口。"""

import asyncio
from pathlib import Path
from typing import Annotated

import typer
from click import Context, Option
from typer import rich_utils
from typer.core import TyperCommand, TyperGroup

from src.application import create_service
from src.config import AppSettings
from src.domain import XhsError
from src.interfaces.api import run_api
from src.interfaces.mcp import run_mcp
from src.logging import configure_logging
from src.version import VERSION


class _ChineseHelpMixin:
    """把 Typer/Click 的固定帮助文案转换为自然中文。"""

    def get_usage(self, ctx: Context) -> str:
        """生成中文用法行。

        Args:
            ctx: 当前 Click 命令上下文。

        Returns:
            以“用法”开头的命令说明。
        """
        return super().get_usage(ctx).replace("Usage:", "用法:", 1)

    def get_help_option(self, ctx: Context) -> Option | None:
        """生成中文帮助选项。

        Args:
            ctx: 当前 Click 命令上下文。

        Returns:
            使用中文说明的帮助选项。
        """
        option = super().get_help_option(ctx)
        if option:
            option.help = "显示帮助并退出。"
        return option


class _ChineseTyperGroup(_ChineseHelpMixin, TyperGroup):
    """支持中文固定文案的 Typer 命令组。"""


class _ChineseTyperCommand(_ChineseHelpMixin, TyperCommand):
    """支持中文固定文案的 Typer 子命令。"""


rich_utils.ARGUMENTS_PANEL_TITLE = "参数"
rich_utils.OPTIONS_PANEL_TITLE = "选项"
rich_utils.COMMANDS_PANEL_TITLE = "命令"
rich_utils.ERRORS_PANEL_TITLE = "错误"

app = typer.Typer(
    name="xhs-downloader",
    cls=_ChineseTyperGroup,
    help="小红书作品信息解析与媒体下载工具。",
    add_completion=False,
    no_args_is_help=True,
    pretty_exceptions_show_locals=False,
)


@app.command("download", cls=_ChineseTyperCommand)
def download_command(
    url: Annotated[str, typer.Argument(help="小红书作品链接")],
    index: Annotated[
        list[int] | None,
        typer.Option("--index", "-i", help="指定一基图片序号，可重复传入"),
    ] = None,
    force: Annotated[
        bool,
        typer.Option("--force", help="忽略有效下载记录并重新下载"),
    ] = False,
    env_file: Annotated[
        Path | None,
        typer.Option("--env-file", help="dotenv 配置文件"),
    ] = None,
    output: Annotated[
        Path | None,
        typer.Option("--output", "-o", help="下载数据根目录"),
    ] = None,
) -> None:
    """下载一个作品并输出文件校验信息。

    Args:
        url: 小红书作品链接。
        index: 仅下载指定图片序号。
        force: 是否强制重新下载。
        env_file: dotenv 配置文件。
        output: 覆盖配置中的数据根目录。
    """
    overrides = {"work_path": output} if output else {}
    settings = AppSettings.from_env(env_file, **overrides)
    configure_logging(settings.log_level)
    _run_download(settings, url, set(index or []), force)


@app.command("detail", cls=_ChineseTyperCommand)
def detail_command(
    url: Annotated[str, typer.Argument(help="小红书作品链接")],
    env_file: Annotated[
        Path | None,
        typer.Option("--env-file", help="dotenv 配置文件"),
    ] = None,
) -> None:
    """解析一个作品并输出中文 JSON。

    Args:
        url: 小红书作品链接。
        env_file: dotenv 配置文件。
    """
    settings = AppSettings.from_env(env_file)
    configure_logging(settings.log_level)

    async def task() -> None:
        async with create_service(settings) as service:
            detail = await service.get_detail(url)
            typer.echo(detail.model_dump_json(by_alias=True, indent=2))

    _run(task())


@app.command("api", cls=_ChineseTyperCommand)
def api_command(
    env_file: Annotated[
        Path | None,
        typer.Option("--env-file", help="dotenv 配置文件"),
    ] = None,
    host: Annotated[
        str | None,
        typer.Option("--host", help="监听地址"),
    ] = None,
    port: Annotated[
        int | None,
        typer.Option("--port", help="监听端口"),
    ] = None,
) -> None:
    """启动 HTTP API 服务。

    Args:
        env_file: dotenv 配置文件。
        host: 覆盖监听地址。
        port: 覆盖监听端口。
    """
    overrides = _server_overrides(host, port)
    _run(run_api(AppSettings.from_env(env_file, **overrides)))


@app.command("mcp", cls=_ChineseTyperCommand)
def mcp_command(
    env_file: Annotated[
        Path | None,
        typer.Option("--env-file", help="dotenv 配置文件"),
    ] = None,
    host: Annotated[
        str | None,
        typer.Option("--host", help="监听地址"),
    ] = None,
    port: Annotated[
        int | None,
        typer.Option("--port", help="监听端口"),
    ] = None,
) -> None:
    """启动 Streamable HTTP MCP 服务。

    Args:
        env_file: dotenv 配置文件。
        host: 覆盖监听地址。
        port: 覆盖监听端口。
    """
    overrides = _server_overrides(host, port)
    _run(run_mcp(AppSettings.from_env(env_file, **overrides)))


@app.command("version", cls=_ChineseTyperCommand)
def version_command() -> None:
    """输出当前程序版本。"""
    typer.echo(f"xhs-downloader {VERSION}")


def _run_download(
    settings: AppSettings,
    url: str,
    indexes: set[int],
    force: bool,
) -> None:
    async def task() -> None:
        async with create_service(settings) as service:
            outcome = await service.download(url, indexes, force)
            typer.echo(outcome.message)
            for artifact in outcome.artifacts:
                typer.echo(
                    f"{artifact.path} | {artifact.size} 字节 | "
                    f"SHA-256 {artifact.sha256}"
                )

    _run(task())


def _run(coroutine) -> None:
    try:
        asyncio.run(coroutine)
    except XhsError as error:
        typer.echo(f"错误：{error}", err=True)
        raise typer.Exit(code=1) from error


def _server_overrides(host: str | None, port: int | None) -> dict:
    return {
        key: value
        for key, value in {"server_host": host, "server_port": port}.items()
        if value is not None
    }
