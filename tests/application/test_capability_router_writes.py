"""统一能力路由写操作测试。"""

from collections.abc import Callable
from typing import Any

import pytest
from xhs_core.application import CapabilityRouter
from xhs_core.domain import (
    ProviderError,
    ProviderFailureCode,
    ProviderKind,
    RoutePolicyError,
    RouteStrategy,
)

ProviderFactory = Callable[[], Any]


def _success(
    calls: list[ProviderKind],
    value: Any,
) -> ProviderFactory:
    async def _operation() -> Any:
        calls.append(ProviderKind.BROWSER)
        return value

    return _operation


def _failure(calls: list[ProviderKind]) -> ProviderFactory:
    async def _operation() -> Any:
        calls.append(ProviderKind.BROWSER)
        raise ProviderError(
            ProviderKind.BROWSER,
            ProviderFailureCode.TIMEOUT_BEFORE_EFFECT,
            "synthetic failure",
        )

    return _operation


@pytest.mark.parametrize(
    "strategy",
    [
        RouteStrategy.HTTP_ONLY,
        RouteStrategy.HTTP_FIRST,
        RouteStrategy.BROWSER_FIRST,
    ],
)
async def test_write_rejects_non_browser_only_strategy(
    strategy: RouteStrategy,
) -> None:
    """确保写能力无法配置跨提供方路由。

    Args:
        strategy: 待拒绝的非 browser_only 策略。
    """
    calls: list[ProviderKind] = []

    with pytest.raises(RoutePolicyError, match="browser_only"):
        await CapabilityRouter().execute_write(
            strategy,
            browser=_success(calls, True),
        )

    assert calls == []


async def test_write_calls_browser_once_and_returns_route_metadata() -> None:
    """确保写能力仅调用一次浏览器并返回完整路由元数据。"""
    calls: list[ProviderKind] = []

    result = await CapabilityRouter().execute_write(
        RouteStrategy.BROWSER_ONLY,
        browser=_success(calls, {"verified": True}),
    )

    assert calls == [ProviderKind.BROWSER]
    assert result.value == {"verified": True}
    assert result.provider is ProviderKind.BROWSER
    assert result.strategy is RouteStrategy.BROWSER_ONLY
    assert not result.fallback_used
    assert result.fallback_reason is None
    assert result.attempted_providers == (ProviderKind.BROWSER,)


async def test_write_failure_is_never_retried() -> None:
    """确保浏览器写失败原样抛出且只调用一次。"""
    calls: list[ProviderKind] = []

    with pytest.raises(ProviderError) as captured:
        await CapabilityRouter().execute_write(
            RouteStrategy.BROWSER_ONLY,
            browser=_failure(calls),
        )

    assert captured.value.safe_to_fallback
    assert calls == [ProviderKind.BROWSER]


async def test_missing_write_provider_is_typed_failure() -> None:
    """确保浏览器写实现缺失时返回可诊断的类型化失败。"""
    with pytest.raises(ProviderError) as captured:
        await CapabilityRouter().execute_write(RouteStrategy.BROWSER_ONLY)

    assert captured.value.provider is ProviderKind.BROWSER
    assert captured.value.code is ProviderFailureCode.NOT_CONFIGURED
