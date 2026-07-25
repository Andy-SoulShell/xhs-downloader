"""FastMCP 工具接口测试。"""

from fastmcp import Client
from xhs_mcp.server import create_mcp

from tests.interfaces.helpers import FakeService


class _FakeBrowserClient:
    def __init__(self) -> None:
        self.calls: list[tuple[str, dict]] = []

    async def execute(self, path: str, payload: dict) -> dict:
        self.calls.append((path, payload))
        return {
            "task_id": "synthetic-browser-task",
            "message": "合成浏览结果",
            "data": {"items": []},
        }


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


async def test_mcp_browser_tools_delegate_to_local_api() -> None:
    """确保迁移的浏览工具只通过类型化本机 API 客户端执行。"""
    browser = _FakeBrowserClient()
    mcp = create_mcp(FakeService(), browser)
    async with Client(mcp) as client:
        tools = await client.list_tools()
        search = await client.call_tool(
            "search_feeds",
            {
                "keyword": "合成关键词",
                "sort_by": "最新",
                "note_type": "图文",
            },
        )
        profile = await client.call_tool(
            "user_profile",
            {
                "user_id": "synthetic-user",
                "xsec_token": "synthetic-token",
            },
        )
        liked = await client.call_tool(
            "like_feed",
            {
                "feed_id": "synthetic-feed",
                "xsec_token": "synthetic-token",
                "request_id": "synthetic-like-request",
                "unlike": True,
            },
        )
        await client.call_tool(
            "favorite_feed",
            {
                "feed_id": "synthetic-feed",
                "xsec_token": "synthetic-token",
                "request_id": "synthetic-favorite-request",
            },
        )
        await client.call_tool(
            "post_comment_to_feed",
            {
                "feed_id": "synthetic-feed",
                "xsec_token": "synthetic-token",
                "content": "合成评论",
                "request_id": "synthetic-comment-request",
            },
        )
        await client.call_tool(
            "reply_comment_in_feed",
            {
                "feed_id": "synthetic-feed",
                "xsec_token": "synthetic-token",
                "content": "合成回复",
                "comment_id": "synthetic-comment",
                "request_id": "synthetic-reply-request",
            },
        )

    names = [tool.name for tool in tools]
    assert names == [
        "get_detail_data",
        "download_detail",
        "check_login_status",
        "list_feeds",
        "search_feeds",
        "get_feed_detail",
        "user_profile",
        "get_my_profile",
        "like_feed",
        "favorite_feed",
        "post_comment_to_feed",
        "reply_comment_in_feed",
    ]
    assert search.data["task_id"] == "synthetic-browser-task"
    assert profile.data["data"] == {"items": []}
    assert liked.data["message"] == "合成浏览结果"
    assert browser.calls == [
        (
            "/xhs/feeds/search",
            {
                "keyword": "合成关键词",
                "filters": {
                    "sort_by": "最新",
                    "note_type": "图文",
                    "publish_time": "不限",
                    "search_scope": "不限",
                    "location": "不限",
                },
            },
        ),
        (
            "/xhs/user/profile",
            {
                "user_id": "synthetic-user",
                "xsec_token": "synthetic-token",
            },
        ),
        (
            "/xhs/feeds/like",
            {
                "feed_id": "synthetic-feed",
                "xsec_token": "synthetic-token",
                "active": False,
                "request_id": "synthetic-like-request",
            },
        ),
        (
            "/xhs/feeds/favorite",
            {
                "feed_id": "synthetic-feed",
                "xsec_token": "synthetic-token",
                "active": True,
                "request_id": "synthetic-favorite-request",
            },
        ),
        (
            "/xhs/feeds/comment",
            {
                "feed_id": "synthetic-feed",
                "xsec_token": "synthetic-token",
                "content": "合成评论",
                "request_id": "synthetic-comment-request",
            },
        ),
        (
            "/xhs/feeds/comment/reply",
            {
                "feed_id": "synthetic-feed",
                "xsec_token": "synthetic-token",
                "content": "合成回复",
                "comment_id": "synthetic-comment",
                "user_id": None,
                "request_id": "synthetic-reply-request",
            },
        ),
    ]


async def test_mcp_reply_requires_a_target() -> None:
    """确保 MCP 在提交任务前拒绝没有目标的回复。"""
    mcp = create_mcp(FakeService(), _FakeBrowserClient())
    async with Client(mcp) as client:
        result = await client.call_tool(
            "reply_comment_in_feed",
            {
                "feed_id": "synthetic-feed",
                "xsec_token": "synthetic-token",
                "content": "合成回复",
                "request_id": "synthetic-reply-request",
            },
            raise_on_error=False,
        )

    assert result.is_error is True
