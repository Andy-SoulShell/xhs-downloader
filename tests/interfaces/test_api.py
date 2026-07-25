"""FastAPI 接口测试。"""

from asyncio import sleep
from datetime import UTC, datetime

from httpx import ASGITransport, AsyncClient
from xhs_adapters.config import AppSettings
from xhs_api.app import create_api

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

    assert capabilities.json()["protocol_version"] == 4
    assert capabilities.json()["features"]["browser_tasks"] is True
    assert capabilities.json()["features"]["publication"] is True
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


async def test_api_manages_persistent_download_tasks(tmp_path) -> None:
    """确保任务接口支持幂等提交、查询和状态约束。

    Args:
        tmp_path: pytest 提供的临时目录。
    """
    api = create_api(AppSettings(work_path=tmp_path), lambda _: FakeService())
    payload = {
        "url": "https://example.invalid/synthetic-work",
        "index": [2, 1],
        "request_id": "synthetic-request",
    }
    async with (
        api.router.lifespan_context(api),
        AsyncClient(
            transport=ASGITransport(app=api),
            base_url="http://test",
        ) as client,
    ):
        submitted = await client.post("/tasks", json=payload)
        repeated = await client.post("/tasks", json=payload)
        task_id = submitted.json()["task_id"]
        completed = None
        for _ in range(100):
            completed = await client.get(f"/tasks/{task_id}")
            if completed.json()["status"] == "completed":
                break
            await sleep(0.01)
        listed = await client.get("/tasks?status=completed")
        missing = await client.get("/tasks/missing")
        invalid_retry = await client.post(f"/tasks/{task_id}/retry")
        missing_retry = await client.post("/tasks/missing/retry")

    assert submitted.status_code == 202
    assert repeated.json()["task_id"] == task_id
    assert completed.json()["attempts"] == 1
    assert listed.json()[0]["task_id"] == task_id
    assert missing.status_code == 404
    assert invalid_retry.status_code == 400
    assert missing_retry.status_code == 404


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


async def test_api_manages_settings_without_returning_secrets(tmp_path) -> None:
    """确保管理后台可保存配置，但响应不会回传敏感内容。

    Args:
        tmp_path: pytest 提供的临时目录。
    """
    env_file = tmp_path.joinpath(".env")
    settings = AppSettings(work_path=tmp_path)
    api = create_api(
        settings,
        lambda _: FakeService(),
        env_file,
        lambda _: True,
    )
    async with (
        api.router.lifespan_context(api),
        AsyncClient(
            transport=ASGITransport(app=api),
            base_url="http://test",
        ) as client,
    ):
        updated = await client.put(
            "/settings",
            json={
                "timeout": 30,
                "folder_name": "media",
                "cookie": "session=synthetic",
                "proxy": "http://user:secret@127.0.0.1:7890",
            },
        )
        loaded = await client.get("/settings")

    assert updated.status_code == 200
    assert updated.json()["cookie_configured"] is True
    assert updated.json()["proxy_configured"] is True
    assert updated.json()["restart_required"] is True
    assert updated.json()["values"]["timeout"] == 30
    assert loaded.json()["values"]["folder_name"] == "media"
    assert "session=synthetic" not in updated.text
    assert "user:secret" not in updated.text
    assert "session=synthetic" in env_file.read_text(encoding="utf-8")


async def test_api_restricts_settings_to_local_web_origins(tmp_path) -> None:
    """确保扩展来源和非本机来源不能访问配置管理。

    Args:
        tmp_path: pytest 提供的临时目录。
    """
    api = create_api(
        AppSettings(work_path=tmp_path),
        lambda _: FakeService(),
        tmp_path.joinpath(".env"),
    )
    async with (
        api.router.lifespan_context(api),
        AsyncClient(
            transport=ASGITransport(
                app=api,
                client=("127.0.0.1", 45000),
            ),
            base_url="http://127.0.0.1",
        ) as client,
    ):
        local = await client.get(
            "/settings",
            headers={"Origin": "http://localhost:5173"},
        )
        extension = await client.get(
            "/settings",
            headers={"Origin": "chrome-extension://synthetic-id"},
        )

    assert local.status_code == 200
    assert extension.status_code == 403
    assert extension.json()["detail"] == "配置管理仅允许从本机访问"
