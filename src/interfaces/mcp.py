"""FastMCP 工具接口。"""

from typing import Annotated

from fastmcp import FastMCP
from pydantic import Field

from src.application import DownloadService, create_service
from src.config import AppSettings
from src.logging import configure_logging
from src.version import VERSION


def create_mcp(service: DownloadService) -> FastMCP:
    """为下载服务创建 MCP 工具集合。

    Args:
        service: 已进入生命周期的应用服务。

    Returns:
        注册了详情和下载工具的 FastMCP 实例。
    """
    mcp = FastMCP(
        "xhs-downloader",
        instructions=(
            "提供小红书作品详情解析和媒体下载工具。"
            "下载工具会校验内容指纹与本地文件哈希，避免误用过期记录。"
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

    return mcp


async def run_mcp(settings: AppSettings) -> None:
    """启动 Streamable HTTP MCP 服务。

    Args:
        settings: 服务器与下载配置。
    """
    configure_logging(settings.log_level)
    async with create_service(settings) as service:
        mcp = create_mcp(service)
        await mcp.run_async(
            transport="streamable-http",
            host=settings.server_host,
            port=settings.server_port,
            log_level=None,
            uvicorn_config={
                "log_config": None,
                "log_level": settings.log_level,
            },
        )
