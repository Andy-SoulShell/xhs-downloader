"""登录与写操作在驱动未就绪时的提交前拦截测试。"""

from httpx import ASGITransport, AsyncClient
from xhs_adapters.config import AppSettings
from xhs_api.app import create_api
from xhs_core.domain import BrowserDriver

from tests.interfaces.helpers import FakeService


async def _client(tmp_path):
    api = create_api(
        AppSettings(work_path=tmp_path, browser_driver=BrowserDriver.MANAGED),
        lambda _: FakeService(),
        settings_file=tmp_path.joinpath(".env"),
    )
    return api, AsyncClient(
        transport=ASGITransport(app=api),
        base_url="http://127.0.0.1",
    )


def _assert_blocked(response) -> None:
    """确认请求被就绪门禁拦下, 且原因指向受管浏览器。

    具体是"尚未启动"还是"正由另一个服务实例管理", 取决于运行环境有没有
    别的实例持有它, 两者都是可行动的准确说明。

    Args:
        response: 待检查的 HTTP 响应。
    """
    assert response.status_code >= 400
    payload = response.json()
    assert payload["provider"] == "browser"
    assert payload["code"] in {"unavailable", "not_configured"}
    assert "受管浏览器" in payload["message"]


async def test_login_check_is_rejected_before_dispatch(tmp_path) -> None:
    """受管浏览器没启动时，登录检查必须当场说清原因而不是排队等死。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    api, client = await _client(tmp_path)
    async with api.router.lifespan_context(api), client:
        response = await client.post("/xhs/login/status", json={})

        # 此前会照常建任务并派给一个没启动的执行器, 最后只得到一句
        # "浏览器任务执行失败, 可安全重试" —— 重试一百次也一样失败
        _assert_blocked(response)

        listed = await client.get("/browser/tasks")
        assert listed.json() == []


async def test_qrcode_is_rejected_before_dispatch(tmp_path) -> None:
    """二维码登录同样要在提交前拦截。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    api, client = await _client(tmp_path)
    async with api.router.lifespan_context(api), client:
        response = await client.post("/xhs/login/qrcode", json={})

        _assert_blocked(response)


async def test_cookie_cleanup_is_rejected_before_dispatch(tmp_path) -> None:
    """清除浏览器 Cookie 属于写操作, 也不该派给未启动的执行器。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    api, client = await _client(tmp_path)
    async with api.router.lifespan_context(api), client:
        response = await client.post(
            "/xhs/login/cookies/delete",
            json={"target": "browser", "confirmed": True},
        )

        _assert_blocked(response)
