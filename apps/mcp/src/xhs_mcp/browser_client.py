"""MCP 调用本机浏览器与登录会话 API 的客户端。"""

from typing import Literal, Protocol

from httpx import AsyncClient, HTTPError
from pydantic import BaseModel, ConfigDict, JsonValue
from xhs_core.domain import BrowserTask, BrowserTaskError, BrowserTaskStatus


class _CookieDeletionResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    target: Literal["browser", "http"]
    status: BrowserTaskStatus
    deleted: bool
    message: str
    task_id: str | None = None
    restart_required: bool = False


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

    async def delete_cookies(
        self,
        target: Literal["browser", "http"],
        confirmed: bool,
        request_id: str,
    ) -> dict[str, JsonValue]:
        """清理指定会话的 Cookie。

        Args:
            target: 浏览器会话或 Cookie HTTP 会话。
            confirmed: 调用方是否已明确确认。
            request_id: 调用方生成的幂等请求标识。

        Returns:
            经本机 API 验证的清理结果。

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

    async def delete_cookies(
        self,
        target: Literal["browser", "http"],
        confirmed: bool,
        request_id: str,
    ) -> dict[str, JsonValue]:
        """清理指定会话的 Cookie 并验证响应。

        Args:
            target: 浏览器会话或 Cookie HTTP 会话。
            confirmed: 调用方是否已明确确认。
            request_id: 调用方生成的幂等请求标识。

        Returns:
            清理目标、执行状态与重启提示。

        Raises:
            BrowserTaskError: API 不可用、响应无效、任务失败或等待超时。
        """
        try:
            response = await self._client.post(
                "/xhs/login/cookies/delete",
                params={"wait_seconds": self._wait_seconds},
                json={
                    "target": target,
                    "confirmed": confirmed,
                    "request_id": request_id,
                },
            )
            response.raise_for_status()
            result = _CookieDeletionResponse.model_validate(response.json())
        except (HTTPError, ValueError) as error:
            raise BrowserTaskError("无法调用本机 Cookie 清理 API") from error
        if result.status is BrowserTaskStatus.SUCCEEDED:
            return result.model_dump(mode="json")
        if result.status in {
            BrowserTaskStatus.FAILED,
            BrowserTaskStatus.NEEDS_REVIEW,
        }:
            raise BrowserTaskError(result.message)
        task_hint = f"，可通过任务 {result.task_id} 查询进度" if result.task_id else ""
        raise BrowserTaskError(f"等待浏览器扩展清理 Cookie 超时{task_hint}")
