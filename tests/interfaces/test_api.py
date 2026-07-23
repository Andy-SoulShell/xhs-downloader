"""FastAPI 接口测试。"""

from datetime import UTC, datetime

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


async def test_api_exposes_extension_capabilities_and_record_sync(tmp_path) -> None:
    """确保扩展能发现服务能力并幂等同步独立下载记录。

    Args:
        tmp_path: pytest 提供的临时目录。
    """
    api = create_api(AppSettings(work_path=tmp_path), lambda _: FakeService())
    record = {
        "record_id": "synthetic-record",
        "work_id": "synthetic-work",
        "source_url": "https://example.invalid/synthetic-work",
        "title": "合成测试作品",
        "mode": "browser",
        "status": "completed",
        "media_indexes": [1, 2],
        "created_at": datetime.now(UTC).isoformat(),
        "message": "合成下载完成",
    }
    async with (
        api.router.lifespan_context(api),
        AsyncClient(
            transport=ASGITransport(app=api),
            base_url="http://test",
        ) as client,
    ):
        capabilities = await client.get("/extension/capabilities")
        saved = await client.post("/extension/records", json={"records": [record]})
        repeated = await client.post(
            "/extension/records",
            json={"records": [record]},
        )
        records = await client.get("/extension/records?limit=10")

    assert capabilities.json()["protocol_version"] == 1
    assert capabilities.json()["features"]["artifact_validation"] is True
    assert saved.json() == {"accepted": 1}
    assert repeated.json() == {"accepted": 1}
    stored = records.json()[0]
    assert stored | {"created_at": record["created_at"]} == record
    assert datetime.fromisoformat(stored["created_at"]) == datetime.fromisoformat(
        record["created_at"]
    )


async def test_api_allows_only_extension_origins_for_cross_origin_requests() -> None:
    """确保跨域策略只向浏览器扩展来源开放。"""
    api = create_api(AppSettings(), lambda _: FakeService())
    async with (
        api.router.lifespan_context(api),
        AsyncClient(
            transport=ASGITransport(app=api),
            base_url="http://test",
        ) as client,
    ):
        allowed = await client.options(
            "/extension/capabilities",
            headers={
                "Origin": "chrome-extension://synthetic-id",
                "Access-Control-Request-Method": "GET",
            },
        )
        rejected = await client.options(
            "/extension/capabilities",
            headers={
                "Origin": "https://example.invalid",
                "Access-Control-Request-Method": "GET",
            },
        )

    assert allowed.headers["access-control-allow-origin"] == (
        "chrome-extension://synthetic-id"
    )
    assert "access-control-allow-origin" not in rejected.headers


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
