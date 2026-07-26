"""类型化浏览器能力 HTTP API 测试。"""

from httpx import ASGITransport, AsyncClient
from xhs_adapters.config import AppSettings
from xhs_api.app import create_api
from xhs_core.domain import BrowserDriver

from tests.interfaces.helpers import FakeService


async def test_browser_write_routes_freeze_selected_driver(tmp_path) -> None:
    """确保登录检查和写操作冻结当前选择的浏览器驱动。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    api = create_api(
        AppSettings(
            work_path=tmp_path,
            browser_driver=BrowserDriver.MANAGED,
        ),
        lambda _: FakeService(),
    )
    async with (
        api.router.lifespan_context(api),
        AsyncClient(
            transport=ASGITransport(app=api),
            base_url="http://127.0.0.1:5556",
        ) as client,
    ):
        login = await client.post("/xhs/login/status", json={})
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
        queued = await client.get("/browser/tasks")

    assert login.status_code == 202
    assert login.json()["target_driver"] == "managed"
    assert liked.json()["payload"]["active"] is True
    assert liked.json()["target_driver"] == "managed"
    assert favorite.json()["payload"]["active"] is False
    # 受管浏览器尚未实现评论: 提交阶段即拒绝而不是入队后失败。
    assert commented.status_code == 400
    assert replied.status_code == 400
    assert "尚未支持" in commented.json()["message"]
    assert {task["kind"] for task in queued.json()} == {
        "check_login_status",
        "set_like",
        "set_favorite",
    }


async def test_extension_driver_accepts_comment_operations(tmp_path) -> None:
    """确保扩展驱动仍然接受评论与回复提交。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    api = create_api(
        AppSettings(
            work_path=tmp_path,
            browser_driver=BrowserDriver.EXTENSION,
        ),
        lambda _: FakeService(),
    )
    async with (
        api.router.lifespan_context(api),
        AsyncClient(
            transport=ASGITransport(app=api),
            base_url="http://127.0.0.1:5556",
        ) as client,
    ):
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

    assert commented.status_code == 202
    assert commented.json()["kind"] == "post_comment"
    assert commented.json()["target_driver"] == "extension"
    assert replied.status_code == 202
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
    assert invalid_reply.status_code == 422
