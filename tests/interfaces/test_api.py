"""FastAPI 接口测试。"""

from httpx import ASGITransport, AsyncClient

from src.config import AppSettings
from src.interfaces.api import create_api
from tests.interfaces.helpers import FakeService


async def test_api_reports_service_status() -> None:
    """确保服务信息和健康检查端点可用。"""
    api = create_api(AppSettings(), lambda _: FakeService())
    async with (
        api.router.lifespan_context(api),
        AsyncClient(
            transport=ASGITransport(app=api),
            base_url="http://test",
        ) as client,
    ):
        info = await client.get("/")
        health = await client.get("/health")

    assert info.json()["name"] == "xhs-downloader"
    assert health.json() == {"status": "ok"}


async def test_api_returns_chinese_structured_data() -> None:
    """确保详情接口返回中文结构化数据。"""
    api = create_api(AppSettings(), lambda _: FakeService())
    async with (
        api.router.lifespan_context(api),
        AsyncClient(
            transport=ASGITransport(app=api),
            base_url="http://test",
        ) as client,
    ):
        response = await client.post(
            "/xhs/detail",
            json={"url": "https://example.invalid/work"},
        )

    assert response.status_code == 200
    assert response.json()["data"]["作品标题"] == "合成测试作品"


async def test_api_download_forwards_all_options() -> None:
    """确保下载请求把序号、强制开关和 Cookie 完整传给应用层。"""
    service = FakeService(with_artifact=True)
    api = create_api(AppSettings(), lambda _: service)
    async with (
        api.router.lifespan_context(api),
        AsyncClient(
            transport=ASGITransport(app=api),
            base_url="http://test",
        ) as client,
    ):
        response = await client.post(
            "/xhs/detail",
            json={
                "url": "https://example.invalid/work",
                "download": True,
                "index": [2],
                "force": True,
                "cookie": "session=synthetic",
            },
        )

    assert response.status_code == 200
    assert len(response.json()["files"]) == 1
    assert service.download_arguments == (
        "https://example.invalid/work",
        {2},
        True,
        "session=synthetic",
    )


async def test_api_converts_domain_error_to_bad_request() -> None:
    """确保可预期领域异常返回四百状态码。"""
    api = create_api(AppSettings(), lambda _: FakeService(fail=True))
    async with (
        api.router.lifespan_context(api),
        AsyncClient(
            transport=ASGITransport(app=api),
            base_url="http://test",
        ) as client,
    ):
        response = await client.post(
            "/xhs/detail",
            json={"url": "https://example.invalid/work"},
        )

    assert response.status_code == 400
    assert response.json() == {"message": "合成接口错误"}
