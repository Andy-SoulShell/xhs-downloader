"""统一能力路由应用服务测试。"""

from collections.abc import Callable
from typing import Any

import pytest
from xhs_core.application import CapabilityRouter
from xhs_core.domain import (
    ProviderError,
    ProviderFailureCode,
    ProviderKind,
    RouteStrategy,
)

ProviderFactory = Callable[[], Any]


def _success(
    calls: list[ProviderKind],
    provider: ProviderKind,
    value: Any,
) -> ProviderFactory:
    async def _operation() -> Any:
        calls.append(provider)
        return value

    return _operation


def _failure(
    calls: list[ProviderKind],
    provider: ProviderKind,
    code: ProviderFailureCode,
) -> ProviderFactory:
    async def _operation() -> Any:
        calls.append(provider)
        raise ProviderError(provider, code, f"{provider.value} synthetic failure")

    return _operation


@pytest.mark.parametrize(
    ("strategy", "expected"),
    [
        (RouteStrategy.HTTP_ONLY, [ProviderKind.HTTP]),
        (RouteStrategy.BROWSER_ONLY, [ProviderKind.BROWSER]),
        (RouteStrategy.HTTP_FIRST, [ProviderKind.HTTP]),
        (RouteStrategy.BROWSER_FIRST, [ProviderKind.BROWSER]),
    ],
)
async def test_read_strategy_starts_with_expected_provider(
    strategy: RouteStrategy,
    expected: list[ProviderKind],
) -> None:
    """确保每种只读策略首先调用约定提供方。

    Args:
        strategy: 待验证路由策略。
        expected: 预期调用轨迹。
    """
    calls: list[ProviderKind] = []
    router = CapabilityRouter()

    result = await router.execute_read(
        strategy,
        http=_success(calls, ProviderKind.HTTP, "http"),
        browser=_success(calls, ProviderKind.BROWSER, "browser"),
    )

    assert calls == expected
    assert result.provider is expected[0]
    assert result.value == expected[0].value
    assert not result.fallback_used
    assert result.fallback_reason is None
    assert result.attempted_providers == tuple(expected)


@pytest.mark.parametrize(
    "code",
    [
        ProviderFailureCode.UNAVAILABLE,
        ProviderFailureCode.NOT_CONFIGURED,
        ProviderFailureCode.AUTHENTICATION_EXPIRED,
        ProviderFailureCode.UNSUPPORTED,
        ProviderFailureCode.PAGE_INCOMPATIBLE,
        ProviderFailureCode.TIMEOUT_BEFORE_EFFECT,
        ProviderFailureCode.INVALID_RESULT,
    ],
)
async def test_read_falls_back_for_each_explicitly_safe_error(
    code: ProviderFailureCode,
) -> None:
    """确保每种明确安全失败都允许只读任务回退。

    Args:
        code: 待验证失败分类。
    """
    calls: list[ProviderKind] = []

    result = await CapabilityRouter().execute_read(
        RouteStrategy.HTTP_FIRST,
        http=_failure(calls, ProviderKind.HTTP, code),
        browser=_success(calls, ProviderKind.BROWSER, {"items": []}),
    )

    assert calls == [ProviderKind.HTTP, ProviderKind.BROWSER]
    assert result.value == {"items": []}
    assert result.provider is ProviderKind.BROWSER
    assert result.fallback_used
    assert result.fallback_reason is not None
    assert result.fallback_reason.provider is ProviderKind.HTTP
    assert result.fallback_reason.code is code
    assert result.fallback_reason.message == "http synthetic failure"
    assert result.attempted_providers == (
        ProviderKind.HTTP,
        ProviderKind.BROWSER,
    )


async def test_browser_first_can_fall_back_to_http() -> None:
    """确保 browser_first 使用与 http_first 对称的安全回退顺序。"""
    calls: list[ProviderKind] = []

    result = await CapabilityRouter().execute_read(
        RouteStrategy.BROWSER_FIRST,
        http=_success(calls, ProviderKind.HTTP, "http result"),
        browser=_failure(
            calls,
            ProviderKind.BROWSER,
            ProviderFailureCode.PAGE_INCOMPATIBLE,
        ),
    )

    assert calls == [ProviderKind.BROWSER, ProviderKind.HTTP]
    assert result.provider is ProviderKind.HTTP
    assert result.value == "http result"
    assert result.strategy is RouteStrategy.BROWSER_FIRST


@pytest.mark.parametrize("value", [None, False, 0, "", [], {}])
async def test_empty_success_result_never_triggers_fallback(value: Any) -> None:
    """确保合法空值被视为成功而不是提供方失败。

    Args:
        value: 各类合法但布尔值为假的结果。
    """
    calls: list[ProviderKind] = []

    result = await CapabilityRouter().execute_read(
        RouteStrategy.HTTP_FIRST,
        http=_success(calls, ProviderKind.HTTP, value),
        browser=_success(calls, ProviderKind.BROWSER, "unexpected"),
    )

    assert result.value == value
    assert calls == [ProviderKind.HTTP]
    assert not result.fallback_used


async def test_effect_uncertain_failure_never_falls_back() -> None:
    """确保外部效果不确定时不会改用另一个提供方。"""
    calls: list[ProviderKind] = []

    with pytest.raises(ProviderError) as captured:
        await CapabilityRouter().execute_read(
            RouteStrategy.HTTP_FIRST,
            http=_failure(
                calls,
                ProviderKind.HTTP,
                ProviderFailureCode.EFFECT_UNCERTAIN,
            ),
            browser=_success(calls, ProviderKind.BROWSER, "unexpected"),
        )

    assert captured.value.code is ProviderFailureCode.EFFECT_UNCERTAIN
    assert not captured.value.safe_to_fallback
    assert calls == [ProviderKind.HTTP]


async def test_untyped_failure_never_falls_back() -> None:
    """确保未分类异常不会被路由器误判为安全失败。"""
    calls: list[ProviderKind] = []

    async def _broken_http() -> str:
        calls.append(ProviderKind.HTTP)
        raise RuntimeError("synthetic untyped failure")

    with pytest.raises(RuntimeError, match="synthetic untyped failure"):
        await CapabilityRouter().execute_read(
            RouteStrategy.HTTP_FIRST,
            http=_broken_http,
            browser=_success(calls, ProviderKind.BROWSER, "unexpected"),
        )

    assert calls == [ProviderKind.HTTP]


async def test_missing_preferred_provider_can_fall_back() -> None:
    """确保未配置首选只读提供方会留下结构化回退原因。"""
    calls: list[ProviderKind] = []

    result = await CapabilityRouter().execute_read(
        RouteStrategy.HTTP_FIRST,
        browser=_success(calls, ProviderKind.BROWSER, "browser result"),
    )

    assert calls == [ProviderKind.BROWSER]
    assert result.fallback_used
    assert result.fallback_reason is not None
    assert result.fallback_reason.code is ProviderFailureCode.NOT_CONFIGURED
    assert result.attempted_providers == (
        ProviderKind.HTTP,
        ProviderKind.BROWSER,
    )


async def test_only_strategy_reports_missing_provider() -> None:
    """确保单提供方策略缺少实现时返回类型化失败。"""
    with pytest.raises(ProviderError) as captured:
        await CapabilityRouter().execute_read(RouteStrategy.HTTP_ONLY)

    assert captured.value.provider is ProviderKind.HTTP
    assert captured.value.code is ProviderFailureCode.NOT_CONFIGURED


async def test_second_provider_failure_is_propagated() -> None:
    """确保安全回退后的第二次失败直接交给调用方。"""
    calls: list[ProviderKind] = []

    with pytest.raises(ProviderError) as captured:
        await CapabilityRouter().execute_read(
            RouteStrategy.HTTP_FIRST,
            http=_failure(
                calls,
                ProviderKind.HTTP,
                ProviderFailureCode.UNAVAILABLE,
            ),
            browser=_failure(
                calls,
                ProviderKind.BROWSER,
                ProviderFailureCode.AUTHENTICATION_EXPIRED,
            ),
        )

    assert captured.value.provider is ProviderKind.BROWSER
    assert calls == [ProviderKind.HTTP, ProviderKind.BROWSER]
