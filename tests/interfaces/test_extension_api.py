"""浏览器扩展通用 HTTP API 测试。"""

from datetime import UTC, datetime

from httpx import ASGITransport, AsyncClient
from xhs_adapters.config import AppSettings
from xhs_api.app import create_api

from tests.interfaces.helpers import FakeService


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

    assert capabilities.json()["protocol_version"] == 5
    assert capabilities.json()["features"]["browser_tasks"] is True
    assert capabilities.json()["features"]["account_challenge"] is True
    assert capabilities.json()["features"]["publication"] is True
    assert capabilities.json()["features"]["artifact_validation"] is True
    assert saved.json() == {"accepted": 1}
    assert repeated.json() == {"accepted": 1}
    stored = records.json()[0]
    assert stored | {"created_at": record["created_at"]} == record
    assert datetime.fromisoformat(stored["created_at"]) == datetime.fromisoformat(
        record["created_at"]
    )
