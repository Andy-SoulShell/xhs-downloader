"""小红书登录与双会话清理 MCP 工具。"""

import base64
import re
from typing import Annotated, Literal

from fastmcp import FastMCP
from fastmcp.tools import ToolResult
from fastmcp.utilities.types import Image
from mcp.types import ImageContent, TextContent
from pydantic import Field

from .browser_client import BrowserCapabilityClient

_QR_DATA_PATTERN = re.compile(
    r"^data:image/(?P<format>png|jpeg|webp);base64,(?P<data>[A-Za-z0-9+/=\r\n]+)$"
)
_MAX_QR_BYTES = 384_000


def register_login_tools(
    mcp: FastMCP,
    client: BrowserCapabilityClient,
) -> None:
    """注册登录状态、二维码和双会话清理工具。

    Args:
        mcp: 待扩展的 FastMCP 服务。
        client: 只访问本机 FastAPI 的浏览能力客户端。
    """

    @mcp.tool(
        name="check_login_status",
        description="检查浏览器中的小红书登录状态，不读取或返回 Cookie。",
        annotations=_read_annotations("检查登录状态"),
    )
    async def check_login_status() -> dict:
        return await client.execute("/xhs/login/status", {})

    @mcp.tool(
        name="get_login_qrcode",
        description="从真实小红书登录页取得一次性二维码图片，页面保持打开供扫码。",
        annotations=_read_annotations("获取登录二维码"),
    )
    async def get_login_qrcode() -> ToolResult:
        result = await client.execute("/xhs/login/qrcode", {})
        data = _result_data(result)
        if data.get("is_logged_in") is True:
            return ToolResult(
                content=[TextContent(type="text", text="浏览器已登录，无需再次扫码。")],
                structured_content=_without_qr_data(result),
            )
        image = _decode_qr_image(data.get("image_data_url"))
        return ToolResult(
            content=[
                TextContent(
                    type="text",
                    text="请扫描二维码；登录页面已在浏览器中保持打开。",
                ),
                image,
            ],
            structured_content=_without_qr_data(result),
        )

    @mcp.tool(
        name="delete_cookies",
        description="清理浏览器或 Cookie HTTP 会话；必须明确确认，清理后需要重新登录。",
        annotations=_destructive_annotations("清理登录 Cookie"),
    )
    async def delete_cookies(
        request_id: Annotated[
            str,
            Field(min_length=1, max_length=128, description="幂等请求标识"),
        ],
        confirmed: Annotated[
            bool,
            Field(description="必须为真，表示已确认退出目标会话"),
        ],
        target: Annotated[
            Literal["browser", "http"],
            Field(default="browser", description="要清理的会话模式"),
        ] = "browser",
    ) -> dict:
        if not confirmed:
            raise ValueError("清理 Cookie 前必须明确确认")
        return await client.delete_cookies(target, confirmed, request_id)


def _result_data(result: dict) -> dict:
    value = result.get("data")
    if not isinstance(value, dict):
        raise ValueError("登录二维码结果缺少结构化数据")
    return value


def _decode_qr_image(value: object) -> ImageContent:
    if not isinstance(value, str):
        raise ValueError("登录二维码结果没有图片")
    matched = _QR_DATA_PATTERN.fullmatch(value)
    if not matched:
        raise ValueError("登录二维码图片格式无效")
    try:
        raw = base64.b64decode(
            "".join(matched.group("data").split()),
            validate=True,
        )
    except ValueError as error:
        raise ValueError("登录二维码图片编码无效") from error
    if not raw or len(raw) > _MAX_QR_BYTES:
        raise ValueError("登录二维码图片大小无效")
    return Image(data=raw, format=matched.group("format")).to_image_content()


def _without_qr_data(result: dict) -> dict:
    data = _result_data(result)
    return {
        "task_id": result.get("task_id"),
        "message": result.get("message"),
        "data": {
            "is_logged_in": data.get("is_logged_in") is True,
            "expires_at": data.get("expires_at"),
            "image_delivered": bool(data.get("image_data_url")),
        },
    }


def _read_annotations(title: str) -> dict[str, object]:
    return {
        "title": title,
        "readOnlyHint": True,
        "destructiveHint": False,
        "idempotentHint": True,
        "openWorldHint": True,
    }


def _destructive_annotations(title: str) -> dict[str, object]:
    return {
        "title": title,
        "readOnlyHint": False,
        "destructiveHint": True,
        "idempotentHint": True,
        "openWorldHint": True,
    }
