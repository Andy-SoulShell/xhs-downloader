"""写操作不受访问路由策略影响的接口测试。"""

import pytest
from httpx import ASGITransport, AsyncClient
from xhs_adapters.config import AppSettings
from xhs_api.app import create_api
from xhs_core.domain import BrowserDriver, RouteStrategy

from tests.interfaces.helpers import FakeService


@pytest.mark.parametrize("strategy", list(RouteStrategy))
async def test_writes_always_use_configured_browser_driver(
    tmp_path,
    strategy: RouteStrategy,
) -> None:
    """确保四种路由策略下写操作都提交给当前浏览器驱动。

    点赞、收藏与评论没有 HTTP 实现，策略只作用于只读能力；任何策略都
    不得让写操作走 HTTP、被拒绝或跨提供方回退。

    Args:
        tmp_path: Pytest 提供的临时目录。
        strategy: 参数化的访问路由策略。
    """
    api = create_api(
        AppSettings(
            work_path=tmp_path,
            route_strategy=strategy,
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
        liked = await client.post(
            "/xhs/feeds/like",
            json={
                "feed_id": "synthetic-feed",
                "xsec_token": "synthetic-token",
                "active": True,
            },
        )
        commented = await client.post(
            "/xhs/feeds/comment",
            json={
                "feed_id": "synthetic-feed",
                "xsec_token": "synthetic-token",
                "content": "合成评论",
            },
        )

    assert liked.status_code == 202
    assert liked.json()["target_driver"] == "extension"
    assert commented.status_code == 202
    assert commented.json()["target_driver"] == "extension"
