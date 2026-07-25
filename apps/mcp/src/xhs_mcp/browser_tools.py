"""通过 FastAPI 暴露的小红书浏览 MCP 工具。"""

from typing import Annotated

from fastmcp import FastMCP
from pydantic import Field

from .browser_client import BrowserCapabilityClient


def register_browser_tools(
    mcp: FastMCP,
    client: BrowserCapabilityClient,
) -> None:
    """注册登录状态、内容读取和用户资料工具。

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
        name="list_feeds",
        description="读取浏览器当前账号可见的首页推荐帖子。",
        annotations=_read_annotations("获取推荐帖子"),
    )
    async def list_feeds() -> dict:
        return await client.execute("/xhs/feeds/list", {})

    @mcp.tool(
        name="search_feeds",
        description="按关键词搜索帖子；扩展尚未接入时会明确拒绝非默认筛选。",
        annotations=_read_annotations("搜索帖子"),
    )
    async def search_feeds(
        keyword: Annotated[str, Field(min_length=1, description="搜索关键词")],
        sort_by: Annotated[
            str,
            Field(
                default="综合", description="综合、最新、最多点赞、最多评论或最多收藏"
            ),
        ] = "综合",
        note_type: Annotated[
            str,
            Field(default="不限", description="不限、视频或图文"),
        ] = "不限",
        publish_time: Annotated[
            str,
            Field(default="不限", description="不限、一天内、一周内或半年内"),
        ] = "不限",
        search_scope: Annotated[
            str,
            Field(default="不限", description="不限、已看过、未看过或已关注"),
        ] = "不限",
        location: Annotated[
            str,
            Field(default="不限", description="不限、同城或附近"),
        ] = "不限",
    ) -> dict:
        return await client.execute(
            "/xhs/feeds/search",
            {
                "keyword": keyword,
                "filters": {
                    "sort_by": sort_by,
                    "note_type": note_type,
                    "publish_time": publish_time,
                    "search_scope": search_scope,
                    "location": location,
                },
            },
        )

    @mcp.tool(
        name="get_feed_detail",
        description="读取帖子正文、媒体信息以及指定数量的已加载评论和回复。",
        annotations=_read_annotations("获取帖子详情"),
    )
    async def get_feed_detail(
        feed_id: Annotated[str, Field(description="帖子 ID")],
        xsec_token: Annotated[str, Field(description="帖子访问令牌")],
        comment_limit: Annotated[
            int,
            Field(default=10, ge=0, le=500, description="最多读取的一级评论数"),
        ] = 10,
        include_replies: Annotated[
            bool,
            Field(default=False, description="是否包含已加载回复"),
        ] = False,
        reply_limit: Annotated[
            int,
            Field(default=10, ge=0, le=200, description="每条评论最多读取的回复数"),
        ] = 10,
    ) -> dict:
        return await client.execute(
            "/xhs/feeds/detail",
            {
                "feed_id": feed_id,
                "xsec_token": xsec_token,
                "comment_limit": comment_limit,
                "include_replies": include_replies,
                "reply_limit": reply_limit,
            },
        )

    @mcp.tool(
        name="user_profile",
        description="读取指定用户的公开资料、统计项和帖子摘要。",
        annotations=_read_annotations("获取用户主页"),
    )
    async def user_profile(
        user_id: Annotated[str, Field(description="用户 ID")],
        xsec_token: Annotated[str, Field(description="用户主页访问令牌")],
    ) -> dict:
        return await client.execute(
            "/xhs/user/profile",
            {"user_id": user_id, "xsec_token": xsec_token},
        )

    @mcp.tool(
        name="get_my_profile",
        description="读取浏览器当前登录账号的主页资料和帖子摘要。",
        annotations=_read_annotations("获取当前账号主页"),
    )
    async def get_my_profile() -> dict:
        return await client.execute("/xhs/user/me", {})


def _read_annotations(title: str) -> dict[str, object]:
    return {
        "title": title,
        "readOnlyHint": True,
        "destructiveHint": False,
        "idempotentHint": True,
        "openWorldHint": True,
    }
