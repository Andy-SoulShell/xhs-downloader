"""FastMCP 工具接口。"""

from typing import Annotated

from fastmcp import FastMCP
from httpx import AsyncClient
from pydantic import Field
from xhs_adapters import create_download_service
from xhs_adapters.config import AppSettings
from xhs_adapters.logging import configure_logging
from xhs_core.application import DownloadService
from xhs_core.version import VERSION

from .browser_client import BrowserCapabilityClient, HttpBrowserCapabilityClient
from .browser_tools import register_browser_tools
from .publication_client import (
    HttpPublicationCapabilityClient,
    PublicationCapabilityClient,
)
from .publication_tools import register_publication_tools


def create_mcp(
    service: DownloadService,
    browser: BrowserCapabilityClient | None = None,
    publication: PublicationCapabilityClient | None = None,
) -> FastMCP:
    """为下载服务创建 MCP 工具集合。

    Args:
        service: 已进入生命周期的下载应用服务。
        browser: 可选的本机浏览器能力 API 客户端。
        publication: 可选的本机发布 API 客户端。

    Returns:
        注册了详情和下载工具的 FastMCP 实例。
    """
    mcp = FastMCP(
        "xhs-downloader",
        instructions=(
            "提供小红书作品详情解析、媒体下载和浏览器协作工具。"
            "下载工具会校验内容指纹与本地文件哈希，避免误用过期记录。"
            "浏览器工具只通过本机 API 使用扩展当前登录态，不读取 Cookie。"
        ),
        version=VERSION,
    )

    @mcp.tool(
        name="get_detail_data",
        description="解析一个小红书作品链接，不下载媒体文件。",
        annotations={
            "title": "获取作品详情",
            "readOnlyHint": True,
            "destructiveHint": False,
            "idempotentHint": True,
            "openWorldHint": True,
        },
    )
    async def get_detail_data(
        url: Annotated[str, Field(description="小红书作品链接")],
    ) -> dict:
        detail = await service.get_detail(url)
        return {
            "message": "作品信息解析完成",
            "data": detail.public_dict(),
        }

    @mcp.tool(
        name="download_detail",
        description="下载一个小红书作品，可选择图片序号并返回作品详情。",
        annotations={
            "title": "下载作品媒体",
            "readOnlyHint": False,
            "destructiveHint": False,
            "idempotentHint": True,
            "openWorldHint": True,
        },
    )
    async def download_detail(
        url: Annotated[str, Field(description="小红书作品链接")],
        index: Annotated[
            list[int] | None,
            Field(default=None, description="指定一基图片序号"),
        ],
        force: Annotated[
            bool,
            Field(default=False, description="是否强制重新下载"),
        ],
        return_data: Annotated[
            bool,
            Field(default=False, description="是否返回作品详情"),
        ],
    ) -> dict:
        outcome = await service.download(url, set(index or []), force)
        return {
            "message": outcome.message,
            "data": outcome.detail.public_dict() if return_data else None,
            "files": [file.model_dump(mode="json") for file in outcome.artifacts],
            "skipped": outcome.skipped,
        }

    if browser:
        register_browser_tools(mcp, browser)
    if publication:
        register_publication_tools(mcp, publication)
    return mcp


async def run_mcp(
    settings: AppSettings,
    *,
    api_base_url: str | None = None,
    host: str | None = None,
    port: int | None = None,
) -> None:
    """启动 Streamable HTTP MCP 服务。

    Args:
        settings: 服务器与下载配置。
        api_base_url: 本机 FastAPI 地址。
        host: MCP 监听地址；为空时沿用服务配置。
        port: MCP 监听端口；为空时使用 API 端口的下一个端口。
    """
    configure_logging(settings.log_level)
    resolved_api_url = api_base_url or f"http://127.0.0.1:{settings.server_port}"
    async with (
        create_download_service(settings) as service,
        AsyncClient(base_url=resolved_api_url, timeout=65) as api_client,
    ):
        mcp = create_mcp(
            service,
            HttpBrowserCapabilityClient(api_client),
            HttpPublicationCapabilityClient(api_client),
        )
        await mcp.run_async(
            transport="streamable-http",
            host=host or settings.server_host,
            port=port or settings.server_port + 1,
            log_level=None,
            uvicorn_config={
                "log_config": None,
                "log_level": settings.log_level,
            },
        )
