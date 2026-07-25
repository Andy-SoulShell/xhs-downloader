"""MCP 登录与 Cookie 管理工具测试。"""

import base64

from fastmcp import Client
from xhs_mcp.server import create_mcp

from tests.interfaces.helpers import FakeService


class _FakeLoginClient:
    def __init__(self) -> None:
        self.deletions: list[tuple[str, bool, str]] = []

    async def execute(self, path: str, payload: dict) -> dict:
        assert path == "/xhs/login/qrcode"
        assert payload == {}
        return {
            "task_id": "synthetic-qr-task",
            "message": "登录二维码已生成",
            "data": {
                "is_logged_in": False,
                "image_data_url": "data:image/png;base64,c3ludGhldGljLXFy",
                "expires_at": "2026-01-01T00:04:00Z",
                "consumed": False,
            },
        }

    async def delete_cookies(
        self,
        target: str,
        confirmed: bool,
        request_id: str,
    ) -> dict:
        self.deletions.append((target, confirmed, request_id))
        return {
            "target": target,
            "status": "succeeded",
            "deleted": True,
            "message": "Cookie 已清除",
            "restart_required": target == "http",
        }


async def test_mcp_returns_qrcode_as_image_content() -> None:
    """确保二维码以 MCP 图片块交付且结构化结果不泄露 Base64。"""
    mcp = create_mcp(FakeService(), _FakeLoginClient())
    async with Client(mcp) as client:
        result = await client.call_tool("get_login_qrcode", {})

    assert result.content[0].type == "text"
    assert result.content[1].type == "image"
    assert result.content[1].mimeType == "image/png"
    assert base64.b64decode(result.content[1].data) == b"synthetic-qr"
    assert result.data["data"] == {
        "is_logged_in": False,
        "expires_at": "2026-01-01T00:04:00Z",
        "image_delivered": True,
    }


async def test_mcp_cookie_deletion_requires_confirmation() -> None:
    """确保显式确认后才清理指定会话。"""
    browser = _FakeLoginClient()
    mcp = create_mcp(FakeService(), browser)
    async with Client(mcp) as client:
        rejected = await client.call_tool(
            "delete_cookies",
            {
                "target": "http",
                "confirmed": False,
                "request_id": "synthetic-delete-request",
            },
            raise_on_error=False,
        )
        deleted = await client.call_tool(
            "delete_cookies",
            {
                "target": "http",
                "confirmed": True,
                "request_id": "synthetic-delete-request",
            },
        )
        tools = {tool.name: tool for tool in await client.list_tools()}

    assert rejected.is_error is True
    assert deleted.data["deleted"] is True
    assert browser.deletions == [
        ("http", True, "synthetic-delete-request"),
    ]
    assert tools["delete_cookies"].annotations.destructiveHint is True
    assert tools["delete_cookies"].annotations.idempotentHint is True
