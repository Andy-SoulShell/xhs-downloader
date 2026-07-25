"""通过 FastAPI 暴露的内容发布 MCP 工具。"""

from typing import Annotated, Literal

from fastmcp import FastMCP
from pydantic import Field

from .publication_client import (
    PublicationCapabilityClient,
    PublicationSubmission,
)

Visibility = Literal["public", "private", "mutual"]


def register_publication_tools(
    mcp: FastMCP,
    client: PublicationCapabilityClient,
) -> None:
    """注册图文与视频发布工具。

    Args:
        mcp: 待扩展的 FastMCP 服务。
        client: 只访问本机 FastAPI 的发布客户端。
    """

    @mcp.tool(
        name="publish_content",
        description=(
            "发布图文笔记。调用前必须向用户展示标题、图片、可见范围、"
            "商品和定时时间，并取得明确确认。schedule_at 使用小红书官方定时。"
        ),
        annotations=_publication_annotations("发布图文笔记"),
    )
    async def publish_content(
        title: Annotated[str, Field(max_length=100, description="笔记标题")],
        content: Annotated[str, Field(max_length=5000, description="笔记正文")],
        image_paths: Annotated[
            list[str],
            Field(
                min_length=1,
                max_length=18,
                description="1 至 18 个本机图片绝对路径",
            ),
        ],
        confirmed: Annotated[
            bool,
            Field(description="用户已经明确核对并同意本次外部发布"),
        ],
        tags: Annotated[
            list[str] | None,
            Field(default=None, max_length=20, description="不含井号的话题标签"),
        ] = None,
        schedule_at: Annotated[
            str | None,
            Field(
                default=None,
                description="官方定时时间，ISO 8601 格式，范围为 1 小时至 14 天",
            ),
        ] = None,
        is_original: Annotated[
            bool,
            Field(default=False, description="是否开启官方原创声明"),
        ] = False,
        visibility: Annotated[
            Visibility,
            Field(default="public", description="公开、仅自己或仅互关好友可见"),
        ] = "public",
        products: Annotated[
            list[str] | None,
            Field(
                default=None,
                max_length=20,
                description="已经用户确认的商品名称或商品 ID",
            ),
        ] = None,
    ) -> dict[str, object]:
        _require_confirmation(confirmed)
        request = PublicationSubmission.model_validate(
            {
                "title": title,
                "body": content,
                "tags": tags or [],
                "media_paths": image_paths,
                "media_kind": "image",
                "scheduled_at": schedule_at,
                "visibility": visibility,
                "is_original": is_original,
                "products": products or [],
            }
        )
        return await client.submit(request)

    @mcp.tool(
        name="publish_video",
        description=(
            "发布视频笔记。调用前必须向用户展示标题、视频、可见范围、"
            "商品和定时时间，并取得明确确认。schedule_at 使用小红书官方定时。"
        ),
        annotations=_publication_annotations("发布视频笔记"),
    )
    async def publish_video(
        title: Annotated[str, Field(max_length=100, description="笔记标题")],
        content: Annotated[str, Field(max_length=5000, description="笔记正文")],
        video_path: Annotated[str, Field(description="本机视频绝对路径")],
        confirmed: Annotated[
            bool,
            Field(description="用户已经明确核对并同意本次外部发布"),
        ],
        tags: Annotated[
            list[str] | None,
            Field(default=None, max_length=20, description="不含井号的话题标签"),
        ] = None,
        schedule_at: Annotated[
            str | None,
            Field(
                default=None,
                description="官方定时时间，ISO 8601 格式，范围为 1 小时至 14 天",
            ),
        ] = None,
        visibility: Annotated[
            Visibility,
            Field(default="public", description="公开、仅自己或仅互关好友可见"),
        ] = "public",
        products: Annotated[
            list[str] | None,
            Field(
                default=None,
                max_length=20,
                description="已经用户确认的商品名称或商品 ID",
            ),
        ] = None,
    ) -> dict[str, object]:
        _require_confirmation(confirmed)
        request = PublicationSubmission.model_validate(
            {
                "title": title,
                "body": content,
                "tags": tags or [],
                "media_paths": [video_path],
                "media_kind": "video",
                "scheduled_at": schedule_at,
                "visibility": visibility,
                "products": products or [],
            }
        )
        return await client.submit(request)


def _require_confirmation(confirmed: bool) -> None:
    if not confirmed:
        raise ValueError("发布前必须取得用户明确确认，并将 confirmed 设为 true")


def _publication_annotations(title: str) -> dict[str, object]:
    return {
        "title": title,
        "readOnlyHint": False,
        "destructiveHint": True,
        "idempotentHint": False,
        "openWorldHint": True,
    }
