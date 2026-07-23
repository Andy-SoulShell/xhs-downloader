"""FastMCP 工具接口测试。"""

from fastmcp import Client

from src.interfaces.mcp import create_mcp
from tests.interfaces.helpers import FakeService


async def test_mcp_registers_and_calls_tools() -> None:
    """确保 MCP 工具注册、详情与下载调用链均可用。"""
    service = FakeService(with_artifact=True)
    mcp = create_mcp(service)
    async with Client(mcp) as client:
        tools = await client.list_tools()
        detail = await client.call_tool(
            "get_detail_data",
            {"url": "https://example.invalid/work"},
        )
        download = await client.call_tool(
            "download_detail",
            {
                "url": "https://example.invalid/work",
                "index": [1],
                "force": False,
                "return_data": False,
            },
        )

    assert [tool.name for tool in tools] == ["get_detail_data", "download_detail"]
    assert detail.data["data"]["作品ID"] == "synthetic-work"
    assert download.data["data"] is None
    assert download.data["files"][0]["media_index"] == 1
