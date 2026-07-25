"""MCP 发布客户端与本机 FastAPI 的合成集成测试。"""

from datetime import UTC, datetime, timedelta

import pytest
from httpx import ASGITransport, AsyncClient
from xhs_adapters.config import AppSettings
from xhs_api.app import create_api
from xhs_core.domain import PublicationError
from xhs_mcp.publication_client import (
    HttpPublicationCapabilityClient,
    PublicationSubmission,
)

from tests.interfaces.helpers import FakeService


async def test_mcp_publication_client_submits_via_api(tmp_path) -> None:
    """确保 MCP 只经 API 保存素材和创建官方定时任务。

    Args:
        tmp_path: pytest 提供的临时目录。
    """
    image = tmp_path / "synthetic.jpeg"
    image.write_bytes(b"synthetic-image")
    api = create_api(AppSettings(work_path=tmp_path), lambda _: FakeService())
    async with (
        api.router.lifespan_context(api),
        AsyncClient(
            transport=ASGITransport(app=api),
            base_url="http://127.0.0.1:5556",
        ) as http,
    ):
        client = HttpPublicationCapabilityClient(http)
        result = await client.submit(
            PublicationSubmission(
                title="合成 MCP 图文",
                body="仅用于自动化测试",
                tags=["合成"],
                media_paths=[image],
                media_kind="image",
                scheduled_at=datetime.now(UTC) + timedelta(hours=2),
                visibility="mutual",
                is_original=True,
                products=["合成商品"],
            )
        )
        tasks = await http.get("/publication/tasks")

    assert result["mode"] == "platform_scheduled"
    assert result["status"] == "ready"
    package = tasks.json()[0]["package"]
    assert package["visibility"] == "mutual"
    assert package["is_original"] is True
    assert package["products"] == ["合成商品"]
    assert package["assets"][0]["filename"] == "synthetic.jpeg"


async def test_mcp_publication_client_rejects_unsafe_paths(tmp_path) -> None:
    """确保相对路径、媒体类型和视频数量在请求 API 前被拒绝。

    Args:
        tmp_path: pytest 提供的临时目录。
    """
    image = tmp_path / "synthetic.jpeg"
    image.write_bytes(b"synthetic-image")
    async with AsyncClient(base_url="http://127.0.0.1:5556") as http:
        client = HttpPublicationCapabilityClient(http)
        with pytest.raises(PublicationError, match="绝对路径"):
            await client.submit(
                PublicationSubmission(
                    title="合成",
                    body="正文",
                    media_paths=["relative.jpeg"],
                    media_kind="image",
                )
            )
        with pytest.raises(PublicationError, match="不是受支持的视频"):
            await client.submit(
                PublicationSubmission(
                    title="合成",
                    body="正文",
                    media_paths=[image],
                    media_kind="video",
                )
            )
