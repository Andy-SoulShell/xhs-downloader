"""统一只读能力 API 的响应模型。"""

from pydantic import BaseModel, ConfigDict
from xhs_core.domain import (
    AccountConsistencyStatus,
    BrowserDriver,
    ProviderFailureCode,
    ProviderKind,
    RouteStrategy,
)


class ProviderFailureResponse(BaseModel):
    """触发安全回退的首选提供方失败。"""

    model_config = ConfigDict(extra="forbid")

    provider: ProviderKind
    code: ProviderFailureCode
    message: str


class RouteTraceResponse(BaseModel):
    """一次只读能力调用的实际路由轨迹。"""

    model_config = ConfigDict(extra="forbid")

    provider: ProviderKind
    strategy: RouteStrategy
    browser_driver: BrowserDriver | None
    fallback_used: bool
    fallback_reason: ProviderFailureResponse | None
    attempted_providers: list[ProviderKind]
    account_consistency: AccountConsistencyStatus | None


class RoutedReadResponse[ResultT](BaseModel):
    """统一只读能力的数据与路由元数据。"""

    model_config = ConfigDict(extra="forbid")

    data: ResultT
    route: RouteTraceResponse
