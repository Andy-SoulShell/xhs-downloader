"""采集帖子 HTTP 接口测试。"""

from httpx import ASGITransport, AsyncClient
from xhs_adapters.config import AppSettings
from xhs_api.app import create_api

from tests.interfaces.helpers import FakeService


async def test_collected_posts_survive_service_restart(tmp_path) -> None:
    """确保只解析未下载的帖子也会入库并可在重启后删除。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    settings = AppSettings(work_path=tmp_path)
    first_api = create_api(settings, lambda _: FakeService())
    async with (
        first_api.router.lifespan_context(first_api),
        AsyncClient(
            transport=ASGITransport(app=first_api),
            base_url="http://test",
        ) as client,
    ):
        collected = await client.post(
            "/xhs/detail",
            json={
                "url": "https://example.invalid/collected",
                "download": False,
            },
        )
        listed = await client.get("/posts")

    assert collected.status_code == 200
    assert listed.json()[0]["作品ID"] == "synthetic-work"
    assert listed.json()[0]["作品链接"] == "https://example.invalid/collected"

    restarted_api = create_api(settings, lambda _: FakeService())
    async with (
        restarted_api.router.lifespan_context(restarted_api),
        AsyncClient(
            transport=ASGITransport(app=restarted_api),
            base_url="http://test",
        ) as client,
    ):
        restored = await client.get("/posts")
        removed = await client.delete("/posts/synthetic-work")
        empty = await client.get("/posts")

    assert restored.json()[0]["作品标题"] == "合成测试作品"
    assert removed.status_code == 204
    assert empty.json() == []


async def test_downloading_also_refreshes_collected_post(tmp_path) -> None:
    """确保直接下载详情同样更新帖子库。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    api = create_api(
        AppSettings(work_path=tmp_path),
        lambda _: FakeService(with_artifact=True),
    )
    async with (
        api.router.lifespan_context(api),
        AsyncClient(
            transport=ASGITransport(app=api),
            base_url="http://test",
        ) as client,
    ):
        downloaded = await client.post(
            "/xhs/detail",
            json={
                "url": "https://example.invalid/downloaded",
                "download": True,
            },
        )
        listed = await client.get("/posts?limit=1")

    assert downloaded.status_code == 200
    assert listed.json()[0]["作品链接"] == "https://example.invalid/downloaded"
