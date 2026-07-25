"""统一能力路由使用的领域类型与失败语义。"""

from dataclasses import dataclass
from enum import StrEnum
from typing import TYPE_CHECKING

from .errors import XhsError

if TYPE_CHECKING:
    from .account_consistency import AccountConsistencyStatus


class RouteStrategy(StrEnum):
    """HTTP 与浏览器能力的调用顺序。"""

    HTTP_ONLY = "http_only"
    BROWSER_ONLY = "browser_only"
    HTTP_FIRST = "http_first"
    BROWSER_FIRST = "browser_first"


class ProviderKind(StrEnum):
    """可承载统一能力的提供方类型。"""

    HTTP = "http"
    BROWSER = "browser"


class ProviderFailureCode(StrEnum):
    """提供方失败的稳定机器可读分类。"""

    UNAVAILABLE = "unavailable"
    NOT_CONFIGURED = "not_configured"
    AUTHENTICATION_EXPIRED = "authentication_expired"
    UNSUPPORTED = "unsupported"
    PAGE_INCOMPATIBLE = "page_incompatible"
    TIMEOUT_BEFORE_EFFECT = "timeout_before_effect"
    EFFECT_UNCERTAIN = "effect_uncertain"
    INVALID_RESULT = "invalid_result"


_SAFE_FALLBACK_CODES = frozenset(
    {
        ProviderFailureCode.UNAVAILABLE,
        ProviderFailureCode.NOT_CONFIGURED,
        ProviderFailureCode.AUTHENTICATION_EXPIRED,
        ProviderFailureCode.UNSUPPORTED,
        ProviderFailureCode.PAGE_INCOMPATIBLE,
        ProviderFailureCode.TIMEOUT_BEFORE_EFFECT,
        ProviderFailureCode.INVALID_RESULT,
    }
)


@dataclass(frozen=True, slots=True)
class ProviderFailure:
    """一次提供方失败的可序列化路由元数据。

    Attributes:
        provider: 发生失败的提供方。
        code: 稳定失败分类。
        message: 面向用户的简短失败原因。
    """

    provider: ProviderKind
    code: ProviderFailureCode
    message: str


class ProviderError(XhsError):
    """提供方已按稳定分类声明的类型化失败。

    Attributes:
        provider: 发生失败的提供方。
        code: 稳定失败分类。
        message: 面向用户的简短失败原因。
    """

    def __init__(
        self,
        provider: ProviderKind,
        code: ProviderFailureCode,
        message: str,
    ) -> None:
        self.provider = provider
        self.code = code
        self.message = message
        super().__init__(message)

    @property
    def safe_to_fallback(self) -> bool:
        """判断该失败是否明确发生在产生外部效果之前。

        Returns:
            只读能力可否安全改用另一个提供方。
        """
        return self.code in _SAFE_FALLBACK_CODES

    def as_failure(self) -> ProviderFailure:
        """转换为可放入成功结果的回退原因。

        Returns:
            不包含异常调用栈的结构化失败元数据。
        """
        return ProviderFailure(
            provider=self.provider,
            code=self.code,
            message=self.message,
        )


class RoutePolicyError(XhsError):
    """调用方式违反统一能力的安全路由策略。"""


@dataclass(frozen=True, slots=True)
class RoutedCapabilityResult[T]:
    """统一能力成功结果及其实际路由轨迹。

    Attributes:
        value: 提供方返回的数据，包括合法的空值。
        provider: 实际产生成功结果的提供方。
        strategy: 本次调用采用的路由策略。
        fallback_used: 是否在首选提供方失败后发生回退。
        fallback_reason: 首选提供方触发安全回退的原因。
        attempted_providers: 按调用顺序记录的提供方。
        account_consistency: 本次回退的一次性账号比较结论。
    """

    value: T
    provider: ProviderKind
    strategy: RouteStrategy
    fallback_used: bool
    fallback_reason: ProviderFailure | None
    attempted_providers: tuple[ProviderKind, ...]
    account_consistency: "AccountConsistencyStatus | None" = None
