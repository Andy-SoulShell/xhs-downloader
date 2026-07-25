"""统一能力路由领域类型测试。"""

from xhs_core.domain import (
    ProviderError,
    ProviderFailureCode,
    ProviderKind,
    RouteStrategy,
)


def test_route_strategy_values_are_stable() -> None:
    """确保配置和接口使用的四种路由策略值保持稳定。"""
    assert {item.value for item in RouteStrategy} == {
        "http_only",
        "browser_only",
        "http_first",
        "browser_first",
    }


def test_provider_failure_code_values_are_stable() -> None:
    """确保提供方失败分类覆盖路由决策所需语义。"""
    assert {item.value for item in ProviderFailureCode} == {
        "unavailable",
        "not_configured",
        "authentication_expired",
        "unsupported",
        "page_incompatible",
        "timeout_before_effect",
        "effect_uncertain",
        "invalid_result",
    }


def test_provider_error_converts_to_structured_failure() -> None:
    """确保类型化异常可转换为不含调用栈的结果元数据。"""
    error = ProviderError(
        ProviderKind.HTTP,
        ProviderFailureCode.UNAVAILABLE,
        "HTTP 服务暂不可用",
    )

    failure = error.as_failure()

    assert str(error) == "HTTP 服务暂不可用"
    assert failure.provider is ProviderKind.HTTP
    assert failure.code is ProviderFailureCode.UNAVAILABLE
    assert failure.message == "HTTP 服务暂不可用"
