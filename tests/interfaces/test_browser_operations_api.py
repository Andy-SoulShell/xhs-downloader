"""类型化浏览器能力 HTTP API 测试。"""

from httpx import ASGITransport, AsyncClient
from xhs_adapters.config import AppSettings
from xhs_api.app import create_api

from tests.interfaces.helpers import FakeService


async def test_browser_operation_routes_create_normalized_tasks(tmp_path) -> None:
    """确保高层接口创建可追踪、结构化的浏览器任务。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    api = create_api(AppSettings(work_path=tmp_path), lambda _: FakeService())
    async with (
        api.router.lifespan_context(api),
        AsyncClient(
            transport=ASGITransport(app=api),
            base_url="http://127.0.0.1:5556",
        ) as client,
    ):
        login = await client.post("/xhs/login/status", json={})
        search = await client.post(
            "/xhs/feeds/search",
            json={
                "keyword": "合成关键词",
                "request_id": "synthetic-search-request",
            },
        )
        detail = await client.post(
            "/xhs/feeds/detail",
            json={
                "feed_id": "synthetic-feed",
                "xsec_token": "synthetic-token",
                "include_replies": True,
            },
        )
        profile = await client.post(
            "/xhs/user/profile",
            json={
                "user_id": "synthetic-user",
                "xsec_token": "synthetic-token",
            },
        )
        mine = await client.post("/xhs/user/me?wait_seconds=0", json={})
        liked = await client.post(
            "/xhs/feeds/like",
            json={
                "feed_id": "synthetic-feed",
                "xsec_token": "synthetic-token",
                "active": True,
                "request_id": "synthetic-like-request",
            },
        )
        favorite = await client.post(
            "/xhs/feeds/favorite",
            json={
                "feed_id": "synthetic-feed",
                "xsec_token": "synthetic-token",
                "active": False,
                "request_id": "synthetic-favorite-request",
            },
        )
        commented = await client.post(
            "/xhs/feeds/comment",
            json={
                "feed_id": "synthetic-feed",
                "xsec_token": "synthetic-token",
                "content": "合成评论",
                "request_id": "synthetic-comment-request",
            },
        )
        replied = await client.post(
            "/xhs/feeds/comment/reply",
            json={
                "feed_id": "synthetic-feed",
                "xsec_token": "synthetic-token",
                "content": "合成回复",
                "comment_id": "synthetic-comment",
                "request_id": "synthetic-reply-request",
            },
        )

    assert login.status_code == 202
    assert search.json()["payload"]["filters"]["sort_by"] == "综合"
    assert detail.json()["payload"]["comment_limit"] == 10
    assert profile.json()["kind"] == "get_user_profile"
    assert mine.json()["status"] == "queued"
    assert liked.json()["payload"]["active"] is True
    assert favorite.json()["payload"]["active"] is False
    assert commented.json()["kind"] == "post_comment"
    assert replied.json()["kind"] == "reply_comment"


async def test_browser_operation_routes_reject_invalid_or_remote_input(
    tmp_path,
) -> None:
    """确保高层接口拒绝无效结构和外站管理请求。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    api = create_api(AppSettings(work_path=tmp_path), lambda _: FakeService())
    async with (
        api.router.lifespan_context(api),
        AsyncClient(
            transport=ASGITransport(app=api),
            base_url="http://127.0.0.1:5556",
        ) as client,
    ):
        invalid = await client.post("/xhs/feeds/search", json={"keyword": ""})
        remote = await client.post(
            "/xhs/feeds/list",
            json={},
            headers={"Origin": "https://example.invalid"},
        )
        excessive_wait = await client.post(
            "/xhs/user/me?wait_seconds=61",
            json={},
        )
        invalid_reply = await client.post(
            "/xhs/feeds/comment/reply",
            json={
                "feed_id": "synthetic-feed",
                "xsec_token": "synthetic-token",
                "content": "合成回复",
            },
        )

    assert invalid.status_code == 422
    assert remote.status_code == 403
    assert excessive_wait.status_code == 422
    assert invalid_reply.status_code == 422
