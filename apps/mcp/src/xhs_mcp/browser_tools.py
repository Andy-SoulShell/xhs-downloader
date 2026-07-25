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
        description="按关键词和可选筛选条件搜索小红书帖子。",
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

    @mcp.tool(
        name="like_feed",
        description="将帖子调整为已点赞或未点赞，并在页面状态中核验。",
        annotations=_write_annotations("设置点赞状态"),
    )
    async def like_feed(
        feed_id: Annotated[str, Field(description="帖子 ID")],
        xsec_token: Annotated[str, Field(description="帖子访问令牌")],
        request_id: Annotated[str, Field(description="调用方生成的幂等请求标识")],
        unlike: Annotated[
            bool,
            Field(default=False, description="为真时取消点赞，否则点赞"),
        ] = False,
    ) -> dict:
        return await client.execute(
            "/xhs/feeds/like",
            {
                "feed_id": feed_id,
                "xsec_token": xsec_token,
                "active": not unlike,
                "request_id": request_id,
            },
        )

    @mcp.tool(
        name="favorite_feed",
        description="将帖子调整为已收藏或未收藏，并在页面状态中核验。",
        annotations=_write_annotations("设置收藏状态"),
    )
    async def favorite_feed(
        feed_id: Annotated[str, Field(description="帖子 ID")],
        xsec_token: Annotated[str, Field(description="帖子访问令牌")],
        request_id: Annotated[str, Field(description="调用方生成的幂等请求标识")],
        unfavorite: Annotated[
            bool,
            Field(default=False, description="为真时取消收藏，否则收藏"),
        ] = False,
    ) -> dict:
        return await client.execute(
            "/xhs/feeds/favorite",
            {
                "feed_id": feed_id,
                "xsec_token": xsec_token,
                "active": not unfavorite,
                "request_id": request_id,
            },
        )

    @mcp.tool(
        name="post_comment_to_feed",
        description="发表评论并确认评论区出现新增结果。",
        annotations=_write_annotations("发表评论"),
    )
    async def post_comment_to_feed(
        feed_id: Annotated[str, Field(description="帖子 ID")],
        xsec_token: Annotated[str, Field(description="帖子访问令牌")],
        content: Annotated[str, Field(min_length=1, max_length=1000)],
        request_id: Annotated[str, Field(description="调用方生成的幂等请求标识")],
    ) -> dict:
        return await client.execute(
            "/xhs/feeds/comment",
            {
                "feed_id": feed_id,
                "xsec_token": xsec_token,
                "content": content,
                "request_id": request_id,
            },
        )

    @mcp.tool(
        name="reply_comment_in_feed",
        description="回复指定评论并确认评论区出现新增结果。",
        annotations=_write_annotations("回复评论"),
    )
    async def reply_comment_in_feed(
        feed_id: Annotated[str, Field(description="帖子 ID")],
        xsec_token: Annotated[str, Field(description="帖子访问令牌")],
        content: Annotated[str, Field(min_length=1, max_length=1000)],
        request_id: Annotated[str, Field(description="调用方生成的幂等请求标识")],
        comment_id: Annotated[
            str | None,
            Field(default=None, description="目标评论 ID"),
        ] = None,
        user_id: Annotated[
            str | None,
            Field(default=None, description="目标评论用户 ID"),
        ] = None,
    ) -> dict:
        if not comment_id and not user_id:
            raise ValueError("回复评论必须提供 comment_id 或 user_id")
        return await client.execute(
            "/xhs/feeds/comment/reply",
            {
                "feed_id": feed_id,
                "xsec_token": xsec_token,
                "content": content,
                "comment_id": comment_id,
                "user_id": user_id,
                "request_id": request_id,
            },
        )


def _read_annotations(title: str) -> dict[str, object]:
    return {
        "title": title,
        "readOnlyHint": True,
        "destructiveHint": False,
        "idempotentHint": True,
        "openWorldHint": True,
    }


def _write_annotations(title: str) -> dict[str, object]:
    return {
        "title": title,
        "readOnlyHint": False,
        "destructiveHint": False,
        "idempotentHint": True,
        "openWorldHint": True,
    }
