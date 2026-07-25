"""MCP 调用本机浏览器与登录会话 API 的客户端。"""

from typing import Literal, Protocol

from httpx import AsyncClient, HTTPError, Response
from pydantic import BaseModel, ConfigDict, JsonValue
from xhs_core.domain import BrowserTask, BrowserTaskError, BrowserTaskStatus

type _ProviderKind = Literal["http", "browser"]
type _RouteStrategy = Literal[
    "http_only",
    "browser_only",
    "http_first",
    "browser_first",
]
type _BrowserDriver = Literal["extension", "managed"]
type _AccountConsistency = Literal[
    "matched",
    "different",
    "logged_out",
    "unverified",
]
type _FailureCode = Literal[
    "unavailable",
    "not_configured",
    "authentication_expired",
    "unsupported",
    "page_incompatible",
    "timeout_before_effect",
    "effect_uncertain",
    "invalid_result",
]


class _RouteFallbackReason(BaseModel):
    """首选提供方触发只读安全回退的原因。"""

    model_config = ConfigDict(extra="forbid")

    provider: _ProviderKind
    code: _FailureCode
    message: str


class _CapabilityRoute(BaseModel):
    """统一只读能力经过服务端确认的路由轨迹。"""

    model_config = ConfigDict(extra="forbid")

    provider: _ProviderKind
    strategy: _RouteStrategy
    browser_driver: _BrowserDriver | None
    fallback_used: bool
    fallback_reason: _RouteFallbackReason | None
    attempted_providers: list[_ProviderKind]
    account_consistency: _AccountConsistency | None


class _AccountConsistencyFailure(BaseModel):
    """服务端阻止跨账号回退时的固定脱敏响应。"""

    model_config = ConfigDict(extra="forbid")

    code: Literal["account_consistency_failed"]
    account_consistency: Literal["different", "logged_out", "unverified"]
    message: str


class _RoutedCapabilityResponse(BaseModel):
    """不伪造浏览器任务的同步只读能力响应。"""

    model_config = ConfigDict(extra="forbid")

    data: dict[str, JsonValue]
    route: _CapabilityRoute


class _CookieDeletionResponse(BaseModel):
    """Cookie 清理端点的结构化结果。"""

    model_config = ConfigDict(extra="forbid")

    target: Literal["browser", "http"]
    status: BrowserTaskStatus
    deleted: bool
    message: str
    task_id: str | None = None
    restart_required: bool = False


class BrowserCapabilityClient(Protocol):
    """MCP 统一能力工具依赖的最小 API 客户端边界。"""

    async def execute(
        self,
        path: str,
        payload: dict[str, JsonValue],
    ) -> dict[str, JsonValue]:
        """执行统一只读能力或提交浏览器操作。

        Args:
            path: 类型化浏览器能力 API 路径。
            payload: 已由 MCP 参数结构化的请求。

        Returns:
            只读调用的数据与路由轨迹，或浏览器操作任务结果。

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
    """通过 FastAPI 执行统一只读能力或浏览器操作。

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
        """兼容同步路由响应和浏览器任务终态响应。

        Args:
            path: 类型化浏览器能力 API 路径。
            payload: 任务输入。

        Returns:
            只读调用的数据与路由轨迹，或浏览器任务的终态结果。

        Raises:
            BrowserTaskError: API 不可用、响应无效、任务失败或等待超时。
        """
        try:
            response = await self._client.post(
                path,
                params={"wait_seconds": self._wait_seconds},
                json=payload,
            )
            _raise_account_consistency_failure(response)
            response.raise_for_status()
            payload_data = response.json()
            if _is_routed_response(payload_data):
                routed = _RoutedCapabilityResponse.model_validate(payload_data)
                return routed.model_dump(mode="json")
            task = BrowserTask.model_validate(payload_data)
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


def _is_routed_response(value: object) -> bool:
    return isinstance(value, dict) and "data" in value and "route" in value


def _raise_account_consistency_failure(response: Response) -> None:
    if response.status_code != 409:
        return
    try:
        failure = _AccountConsistencyFailure.model_validate(response.json())
    except ValueError:
        return
    raise BrowserTaskError(failure.message)
