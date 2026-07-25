"""MCP 调用本机浏览器能力 API 的客户端。"""

from typing import Protocol

from httpx import AsyncClient, HTTPError
from pydantic import JsonValue
from xhs_core.domain import BrowserTask, BrowserTaskError, BrowserTaskStatus


class BrowserCapabilityClient(Protocol):
    """MCP 浏览器工具依赖的最小 API 客户端边界。"""

    async def execute(
        self,
        path: str,
        payload: dict[str, JsonValue],
    ) -> dict[str, JsonValue]:
        """提交并等待浏览器能力任务。

        Args:
            path: 类型化浏览器能力 API 路径。
            payload: 已由 MCP 参数结构化的请求。

        Returns:
            包含任务标识、说明和结构化结果的数据。

        Raises:
            BrowserTaskError: API 不可用、任务失败或等待超时。
        """
        ...


class HttpBrowserCapabilityClient:
    """通过 FastAPI 提交并等待浏览器任务。

    Args:
        client: 已配置本机 API 基础地址的异步 HTTP 客户端。
        wait_seconds: 单次 MCP 调用最长等待秒数。
    """

    def __init__(self, client: AsyncClient, wait_seconds: float = 60) -> None:
        self._client = client
        self._wait_seconds = wait_seconds

    async def execute(
        self,
        path: str,
        payload: dict[str, JsonValue],
    ) -> dict[str, JsonValue]:
        """提交任务并只返回经过服务端验证的终态结果。

        Args:
            path: 类型化浏览器能力 API 路径。
            payload: 任务输入。

        Returns:
            任务标识、结果说明和结构化结果。

        Raises:
            BrowserTaskError: API 不可用、响应无效、任务失败或等待超时。
        """
        try:
            response = await self._client.post(
                path,
                params={"wait_seconds": self._wait_seconds},
                json=payload,
            )
            response.raise_for_status()
            task = BrowserTask.model_validate(response.json())
        except (HTTPError, ValueError) as error:
            raise BrowserTaskError("无法调用本机浏览器能力 API") from error
        if task.status is BrowserTaskStatus.SUCCEEDED:
            return {
                "task_id": task.task_id,
                "message": task.message,
                "data": task.result or {},
            }
        if task.status in {
            BrowserTaskStatus.FAILED,
            BrowserTaskStatus.NEEDS_REVIEW,
        }:
            raise BrowserTaskError(task.message)
        raise BrowserTaskError(
            f"等待浏览器扩展执行超时，可通过任务 {task.task_id} 查询进度"
        )
