"""发布增强能力 HTTP API 合成流程测试。"""

from datetime import UTC, datetime, timedelta

from httpx import ASGITransport, AsyncClient
from xhs_adapters.config import AppSettings
from xhs_api.app import create_api

from tests.interfaces.helpers import FakeService

_EXTENSION_ID = "synthetic-publication-enhancement"
_ORIGIN = f"chrome-extension://{_EXTENSION_ID}"


async def _register(client: AsyncClient) -> dict[str, str]:
    response = await client.post(
        "/publication/extension/register",
        json={"extension_id": _EXTENSION_ID},
        headers={"Origin": _ORIGIN},
    )
    assert response.status_code == 200
    return {
        "Origin": _ORIGIN,
        "Authorization": f"Bearer {response.json()['token']}",
        "X-Extension-Id": _EXTENSION_ID,
    }


async def test_publication_api_preserves_options_and_requires_review(tmp_path) -> None:
    """确保官方定时参数被冻结，且不确定结果必须人工核对。

    Args:
        tmp_path: pytest 提供的临时目录。
    """
    api = create_api(AppSettings(work_path=tmp_path), lambda _: FakeService())
    async with (
        api.router.lifespan_context(api),
        AsyncClient(
            transport=ASGITransport(app=api),
            base_url="http://127.0.0.1:5556",
        ) as client,
    ):
        created = await client.post(
            "/publication/drafts",
            json={
                "title": "合成增强发布",
                "body": "仅用于自动化测试",
                "visibility": "mutual",
                "is_original": True,
                "products": ["合成商品 A", " 合成商品 A ", "合成商品 B"],
            },
        )
        draft_id = created.json()["draft_id"]
        await client.post(
            f"/publication/drafts/{draft_id}/assets",
            files={"upload": ("synthetic.jpg", b"synthetic", "image/jpeg")},
        )
        scheduled_at = datetime.now(UTC) + timedelta(hours=2)
        submitted = await client.post(
            f"/publication/drafts/{draft_id}/submit",
            json={
                "mode": "platform_scheduled",
                "scheduled_at": scheduled_at.isoformat(),
            },
        )
        task_id = submitted.json()["task_id"]

        extension_headers = await _register(client)
        claimed = await client.post(
            "/publication/extension/claim",
            json={"preferred_task_id": task_id},
            headers=extension_headers,
        )
        leased_headers = {
            **extension_headers,
            "X-Publish-Lease": claimed.json()["lease_token"],
        }
        uncertain = await client.post(
            f"/publication/tasks/{task_id}/events",
            json={"status": "needs_review", "message": "未能确认平台结果"},
            headers=leased_headers,
        )
        unsafe_retry = await client.post(f"/publication/tasks/{task_id}/retry")
        reviewed = await client.post(
            f"/publication/tasks/{task_id}/review",
            json={"decision": "not_published"},
        )
        retried = await client.post(f"/publication/tasks/{task_id}/retry")

    package = submitted.json()["package"]
    assert created.status_code == 201
    assert created.json()["products"] == ["合成商品 A", "合成商品 B"]
    assert submitted.status_code == 202
    assert submitted.json()["status"] == "ready"
    assert submitted.json()["mode"] == "platform_scheduled"
    assert package["visibility"] == "mutual"
    assert package["is_original"] is True
    assert package["products"] == ["合成商品 A", "合成商品 B"]
    assert uncertain.json()["status"] == "needs_review"
    assert unsafe_retry.status_code == 400
    assert reviewed.json()["status"] == "failed"
    assert retried.json()["status"] == "ready"


async def test_publication_api_validates_schedule_and_review_payload(tmp_path) -> None:
    """确保官方定时边界和人工核对请求在 API 层被校验。

    Args:
        tmp_path: pytest 提供的临时目录。
    """
    api = create_api(AppSettings(work_path=tmp_path), lambda _: FakeService())
    async with (
        api.router.lifespan_context(api),
        AsyncClient(
            transport=ASGITransport(app=api),
            base_url="http://127.0.0.1:5556",
        ) as client,
    ):
        missing_schedule = await client.post(
            "/publication/drafts/missing/submit",
            json={"mode": "platform_scheduled"},
        )
        invalid_review = await client.post(
            "/publication/tasks/missing/review",
            json={
                "decision": "not_published",
                "result_url": "https://example.invalid/work",
            },
        )

    assert missing_schedule.status_code == 422
    assert invalid_review.status_code == 422
