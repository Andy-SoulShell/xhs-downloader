"""内容发布 HTTP API 合成流程测试。"""

from datetime import UTC, datetime, timedelta

from httpx import ASGITransport, AsyncClient
from xhs_adapters.config import AppSettings
from xhs_api.app import create_api
from xhs_core.domain import BrowserDriver

from tests.interfaces.helpers import FakeService

_EXTENSION_ID = "synthetic-extension"
_ORIGIN = f"chrome-extension://{_EXTENSION_ID}"


async def _register(client: AsyncClient) -> dict[str, str]:
    response = await client.post(
        "/publication/extension/register",
        json={"extension_id": _EXTENSION_ID},
        headers={"Origin": _ORIGIN},
    )
    assert response.status_code == 200
    token = response.json()["token"]
    return {
        "Origin": _ORIGIN,
        "Authorization": f"Bearer {token}",
        "X-Extension-Id": _EXTENSION_ID,
    }


async def test_publication_api_completes_manual_extension_flow(tmp_path) -> None:
    """确保本机草稿可由已登记扩展领取、取材并完成发布。

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
                "title": "合成标题",
                "body": "合成正文",
                "tags": ["#自动化", "合成"],
            },
        )
        draft_id = created.json()["draft_id"]
        uploaded = await client.post(
            f"/publication/drafts/{draft_id}/assets",
            files={"upload": ("synthetic.jpg", b"synthetic-media", "image/jpeg")},
        )
        asset_id = uploaded.json()["assets"][0]["asset_id"]
        submitted = await client.post(
            f"/publication/drafts/{draft_id}/submit",
            json={"mode": "manual"},
        )
        task_id = submitted.json()["task_id"]
        extension_headers = await _register(client)
        claim = await client.post(
            "/publication/extension/claim",
            json={"preferred_task_id": task_id},
            headers=extension_headers,
        )
        lease = claim.json()["lease_token"]
        leased_headers = {
            **extension_headers,
            "X-Publish-Lease": lease,
        }
        partial = await client.get(
            f"/publication/tasks/{task_id}/assets/{asset_id}",
            headers={**leased_headers, "Range": "bytes=0-8"},
        )
        filling = await client.post(
            f"/publication/tasks/{task_id}/events",
            json={"status": "filling", "message": "正在填充创作页"},
            headers=leased_headers,
        )
        publishing = await client.post(
            f"/publication/tasks/{task_id}/events",
            json={"status": "publishing", "message": "已经点击发布"},
            headers=leased_headers,
        )
        published = await client.post(
            f"/publication/tasks/{task_id}/events",
            json={
                "status": "published",
                "message": "发布成功",
                "result_url": ("https://www.xiaohongshu.com/explore/synthetic-work"),
            },
            headers=leased_headers,
        )
        listed = await client.get("/publication/tasks")

    assert created.status_code == 201
    assert uploaded.json()["assets"][0]["filename"] == "synthetic.jpeg"
    assert submitted.status_code == 202
    assert claim.json()["task"]["status"] == "claimed"
    assert partial.status_code == 206
    assert partial.content == b"synthetic"
    assert filling.json()["status"] == "filling"
    assert publishing.json()["status"] == "publishing"
    assert published.json()["status"] == "published"
    assert listed.json()[0]["result_url"].endswith("/synthetic-work")


async def test_publication_api_manages_schedule_retry_and_cleanup(tmp_path) -> None:
    """确保管理端可编辑、排期、取消、重试并清理草稿。

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
        created = await client.post("/publication/drafts", json={})
        draft_id = created.json()["draft_id"]
        updated = await client.put(
            f"/publication/drafts/{draft_id}",
            json={"title": "计划标题", "body": "计划正文", "tags": ["计划"]},
        )
        await client.post(
            f"/publication/drafts/{draft_id}/assets",
            files={"upload": ("synthetic.png", b"png-data", "image/png")},
        )
        schedule = datetime.now(UTC) + timedelta(hours=1)
        submitted = await client.post(
            f"/publication/drafts/{draft_id}/submit",
            json={"mode": "scheduled", "scheduled_at": schedule.isoformat()},
        )
        task_id = submitted.json()["task_id"]
        canceled = await client.post(f"/publication/tasks/{task_id}/cancel")
        invalid_retry = await client.post(f"/publication/tasks/{task_id}/retry")
        fetched = await client.get(f"/publication/drafts/{draft_id}")
        deleted = await client.delete(f"/publication/drafts/{draft_id}")
        missing = await client.get(f"/publication/drafts/{draft_id}")

    assert updated.json()["title"] == "计划标题"
    assert submitted.json()["status"] == "scheduled"
    assert canceled.json()["status"] == "canceled"
    assert invalid_retry.status_code == 400
    assert fetched.status_code == 200
    assert deleted.status_code == 204
    assert missing.status_code == 400


async def test_publication_api_freezes_managed_driver_and_private_scope(
    tmp_path,
) -> None:
    """确保管理端按当前配置冻结受管驱动并拒绝扩展领取。

    Args:
        tmp_path: pytest 提供的临时目录。
    """
    settings = AppSettings(
        work_path=tmp_path,
        browser_driver=BrowserDriver.MANAGED,
    )
    api = create_api(settings, lambda _: FakeService())
    async with (
        api.router.lifespan_context(api),
        AsyncClient(
            transport=ASGITransport(app=api),
            base_url="http://127.0.0.1:5556",
        ) as client,
    ):
        private = await client.post(
            "/publication/drafts",
            json={
                "title": "合成私密标题",
                "visibility": "private",
            },
        )
        private_id = private.json()["draft_id"]
        await client.post(
            f"/publication/drafts/{private_id}/assets",
            files={"upload": ("synthetic.png", b"png-data", "image/png")},
        )
        submitted = await client.post(
            f"/publication/drafts/{private_id}/submit",
            json={"mode": "manual"},
        )
        extension_headers = await _register(client)
        extension_claim = await client.post(
            "/publication/extension/claim",
            json={"preferred_task_id": submitted.json()["task_id"]},
            headers=extension_headers,
        )
        public = await client.post(
            "/publication/drafts",
            json={"title": "合成公开标题", "visibility": "public"},
        )
        public_id = public.json()["draft_id"]
        await client.post(
            f"/publication/drafts/{public_id}/assets",
            files={"upload": ("synthetic.png", b"png-data", "image/png")},
        )
        rejected = await client.post(
            f"/publication/drafts/{public_id}/submit",
            json={"mode": "manual"},
        )

    assert submitted.status_code == 202
    assert submitted.json()["target_driver"] == "managed"
    assert extension_claim.json() is None
    assert rejected.status_code == 400
    assert "仅自己可见" in rejected.json()["message"]


async def test_publication_api_enforces_management_and_extension_boundaries(
    tmp_path,
) -> None:
    """确保外站、伪造扩展来源和无能力令牌请求均被拒绝。

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
        hostile = await client.get(
            "/publication/drafts",
            headers={"Origin": "https://example.invalid"},
        )
        wrong_origin = await client.post(
            "/publication/extension/register",
            json={"extension_id": _EXTENSION_ID},
            headers={"Origin": "chrome-extension://other-extension"},
        )
        unauthorized = await client.post(
            "/publication/extension/claim",
            json={},
            headers={
                "Origin": _ORIGIN,
                "X-Extension-Id": _EXTENSION_ID,
            },
        )
        registered = await _register(client)
        no_lease = await client.post(
            "/publication/tasks/missing/events",
            json={"status": "filling", "message": "合成状态"},
            headers=registered,
        )

    assert hostile.status_code == 403
    assert wrong_origin.status_code == 403
    assert unauthorized.status_code == 401
    assert no_lease.status_code == 401
