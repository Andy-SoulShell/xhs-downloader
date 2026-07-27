"""统一只读能力 HTTP API 测试。"""

import json
from typing import cast

from fastapi import FastAPI, Request
from httpx import ASGITransport, AsyncClient
from xhs_adapters.config import AppSettings
from xhs_adapters.settings_repository import DotenvSettingsRepository
from xhs_api.app import create_api
from xhs_api.capability_reads import create_capability_read_router
from xhs_api.capability_runtime import ReadCapabilityRuntime
from xhs_core.application import AtomicClientSlot
from xhs_core.domain import (
    AccountConsistencyError,
    AccountConsistencyStatus,
    BrowserDriver,
    FeedAuthor,
    FeedDetailResult,
    FeedListResult,
    ProviderFailure,
    ProviderFailureCode,
    ProviderKind,
    RoutedCapabilityResult,
    RouteStrategy,
    UserProfileResult,
)

from tests.interfaces.helpers import FakeService


class _FakeRuntime:
    strategy = RouteStrategy.HTTP_FIRST
    browser_driver = BrowserDriver.MANAGED

    async def close(self) -> None:
        pass

    async def list_feeds(self, request_id=None):
        return self._result(FeedListResult(source="home"))

    async def search_feeds(self, keyword, filters, request_id=None):
        return self._result(FeedListResult(source="search", keyword=keyword))

    async def get_feed_detail(
        self,
        feed_id,
        xsec_token,
        *,
        comment_limit,
        include_replies,
        reply_limit,
        request_id=None,
    ):
        return self._result(
            FeedDetailResult(
                feed_id=feed_id,
                xsec_token=xsec_token,
                author=FeedAuthor(user_id="synthetic-author"),
            )
        )

    async def get_user_profile(self, user_id, xsec_token, request_id=None):
        return self._result(UserProfileResult(user_id=user_id))

    async def get_my_profile(self, request_id=None):
        return self._result(UserProfileResult(user_id="synthetic-self"))

    def _result(self, value):
        return RoutedCapabilityResult(
            value=value,
            provider=ProviderKind.BROWSER,
            strategy=self.strategy,
            fallback_used=True,
            fallback_reason=ProviderFailure(
                provider=ProviderKind.HTTP,
                code=ProviderFailureCode.UNSUPPORTED,
                message="HTTP 合成能力暂不支持",
            ),
            attempted_providers=(ProviderKind.HTTP, ProviderKind.BROWSER),
            account_consistency=AccountConsistencyStatus.MATCHED,
        )


async def test_read_routes_return_data_and_actual_route_trace() -> None:
    """确保只读端点不伪装成任务并返回实际回退轨迹。"""
    runtime = cast(ReadCapabilityRuntime, _FakeRuntime())
    slot = AtomicClientSlot(runtime)
    api = FastAPI()
    api.include_router(create_capability_read_router(slot, lambda _: True))
    async with AsyncClient(
        transport=ASGITransport(app=api),
        base_url="http://127.0.0.1:5556",
    ) as client:
        listed = await client.post(
            "/xhs/feeds/list",
            json={"request_id": "synthetic-list"},
        )
        detail = await client.post(
            "/xhs/feeds/detail",
            json={
                "feed_id": "synthetic-feed",
                "xsec_token": "synthetic-token",
            },
        )
        mine = await client.post("/xhs/user/me", json={})
    await slot.close()

    assert listed.status_code == 200
    assert "task_id" not in listed.json()
    assert listed.json()["data"]["source"] == "home"
    assert listed.json()["route"] == {
        "provider": "browser",
        "strategy": "http_first",
        "browser_driver": "managed",
        "fallback_used": True,
        "fallback_reason": {
            "provider": "http",
            "code": "unsupported",
            "message": "HTTP 合成能力暂不支持",
        },
        "attempted_providers": ["http", "browser"],
        "account_consistency": "matched",
    }
    assert detail.json()["data"]["feed_id"] == "synthetic-feed"
    assert mine.json()["data"]["user_id"] == "synthetic-self"


async def test_http_only_without_cookie_returns_typed_error(tmp_path) -> None:
    """确保仅 HTTP 策略未配置 Cookie 时不发起读取或改交浏览器。

    Args:
        tmp_path: Pytest 提供的临时工作目录。
    """
    api = create_api(
        AppSettings(
            work_path=tmp_path,
            cookie="",
            route_strategy=RouteStrategy.HTTP_ONLY,
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
        response = await client.post("/xhs/feeds/list", json={})

    assert response.status_code == 400
    assert response.json() == {
        "message": "HTTP 模式尚未配置 Cookie",
        "provider": "http",
        "code": "not_configured",
    }


async def test_api_returns_fixed_account_consistency_conflict(tmp_path) -> None:
    """确保账号门禁错误只返回固定结论和安全文案。

    Args:
        tmp_path: Pytest 提供的临时工作目录。
    """
    api = create_api(
        AppSettings(work_path=tmp_path),
        lambda _: FakeService(),
    )
    handler = api.exception_handlers[AccountConsistencyError]

    response = await handler(
        cast(Request, object()),
        AccountConsistencyError(AccountConsistencyStatus.DIFFERENT),
    )

    assert response.status_code == 409
    assert json.loads(response.body) == {
        "code": "account_consistency_failed",
        "account_consistency": "different",
        "message": "保存的 Cookie 和浏览器里登录的不是同一个账号，为免串号已经停下",
    }


async def test_settings_hot_swap_changes_next_read_without_restart(tmp_path) -> None:
    """确保保存访问模式后下一次读取立即租用新运行时。

    Args:
        tmp_path: Pytest 提供的临时工作目录。
    """
    settings_file = tmp_path.joinpath(".env")
    DotenvSettingsRepository(settings_file).save({"work_path": tmp_path})
    settings = AppSettings.from_env(settings_file)
    api = create_api(
        settings,
        lambda _: FakeService(),
        settings_file=settings_file,
        settings_access_policy=lambda _: True,
    )
    async with (
        api.router.lifespan_context(api),
        AsyncClient(
            transport=ASGITransport(app=api),
            base_url="http://127.0.0.1:5556",
        ) as client,
    ):
        updated = await client.put(
            "/settings",
            json={
                "route_strategy": "http_only",
                "browser_driver": "managed",
                "timeout": 20,
            },
        )
        read = await client.post("/xhs/feeds/list", json={})

    assert updated.status_code == 200
    assert updated.json()["restart_required"] is False
    assert updated.json()["values"]["route_strategy"] == "http_only"
    assert read.status_code == 400
    assert read.json()["provider"] == "http"


async def test_read_routes_reject_remote_origin() -> None:
    """确保外站页面不能触发本机只读能力。"""
    runtime = cast(ReadCapabilityRuntime, _FakeRuntime())
    slot = AtomicClientSlot(runtime)
    api = FastAPI()
    api.include_router(create_capability_read_router(slot, lambda _: False))
    async with AsyncClient(
        transport=ASGITransport(app=api),
        base_url="http://127.0.0.1:5556",
    ) as client:
        response = await client.post("/xhs/feeds/list", json={})
    await slot.close()

    assert response.status_code == 403
