"""MCP 浏览器能力 HTTP 客户端测试。"""

import pytest
from httpx import AsyncClient, MockTransport, Request, Response
from xhs_core.domain import BrowserTaskError
from xhs_mcp.browser_client import HttpBrowserCapabilityClient


def _task(status: str, message: str = "合成状态") -> dict:
    return {
        "task_id": "synthetic-task",
        "request_id": None,
        "kind": "list_feeds",
        "payload": {},
        "status": status,
        "result": {"items": [], "source": "home", "keyword": None}
        if status == "succeeded"
        else None,
        "extension_id": None,
        "lease_expires_at": None,
        "attempts": 1,
        "message": message,
        "created_at": "2026-01-01T00:00:00Z",
        "updated_at": "2026-01-01T00:00:00Z",
    }


async def test_mcp_browser_client_returns_validated_success() -> None:
    """确保成功任务只暴露服务端已验证的结构化结果。"""

    async def handler(request: Request) -> Response:
        assert request.url.params["wait_seconds"] == "60"
        return Response(202, json=_task("succeeded", "推荐流读取完成"))

    async with AsyncClient(
        transport=MockTransport(handler),
        base_url="http://127.0.0.1:5556",
    ) as client:
        result = await HttpBrowserCapabilityClient(client).execute(
            "/xhs/feeds/list",
            {},
        )

    assert result["data"] == {"items": [], "source": "home", "keyword": None}
    assert result["message"] == "推荐流读取完成"


@pytest.mark.parametrize(
    ("response", "message"),
    [
        (Response(202, json=_task("failed", "页面读取失败")), "页面读取失败"),
        (Response(202, json=_task("queued")), "等待浏览器扩展执行超时"),
        (Response(500), "无法调用本机浏览器能力 API"),
    ],
)
async def test_mcp_browser_client_reports_non_success(
    response: Response,
    message: str,
) -> None:
    """确保失败、超时和 HTTP 错误不会伪装成工具结果。

    Args:
        response: 合成 API 响应。
        message: 预期用户可见错误片段。
    """
    async with AsyncClient(
        transport=MockTransport(lambda _: response),
        base_url="http://127.0.0.1:5556",
    ) as client:
        with pytest.raises(BrowserTaskError, match=message):
            await HttpBrowserCapabilityClient(client).execute(
                "/xhs/feeds/list",
                {},
            )
