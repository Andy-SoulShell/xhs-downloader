"""统一读取路由的账号一致性门禁测试。"""

import asyncio
import json
from dataclasses import asdict
from typing import cast

import pytest
from xhs_core.application import CapabilityRouter
from xhs_core.domain import (
    AccountConsistencyError,
    AccountConsistencyStatus,
    ProviderError,
    ProviderFailureCode,
    ProviderKind,
    ReadAccountScope,
    RouteStrategy,
)

from tests.application.account_consistency_helpers import (
    _failure,
    _Guard,
    _success,
)


async def test_account_scoped_direct_success_does_not_probe_accounts() -> None:
    """确保首选提供方成功时不会产生多余账号探测。"""
    calls: list[ProviderKind] = []
    guard = _Guard(AccountConsistencyStatus.DIFFERENT)
    result = await CapabilityRouter().execute_read(
        RouteStrategy.HTTP_FIRST,
        http=_success(calls, ProviderKind.HTTP),
        browser=_success(calls, ProviderKind.BROWSER),
        account_scope=ReadAccountScope.ACCOUNT_SCOPED,
        account_guard=guard,
    )
    assert calls == [ProviderKind.HTTP]
    assert guard.calls == 0
    assert result.account_consistency is None


async def test_public_fallback_does_not_probe_accounts() -> None:
    """确保公开读取跨提供方回退不依赖账号一致性。"""
    calls: list[ProviderKind] = []
    guard = _Guard(AccountConsistencyStatus.DIFFERENT)
    result = await CapabilityRouter().execute_read(
        RouteStrategy.HTTP_FIRST,
        http=_failure(
            calls,
            ProviderKind.HTTP,
            ProviderFailureCode.UNAVAILABLE,
        ),
        browser=_success(calls, ProviderKind.BROWSER),
        account_scope=ReadAccountScope.PUBLIC,
        account_guard=guard,
    )

    assert calls == [ProviderKind.HTTP, ProviderKind.BROWSER]
    assert guard.calls == 0
    assert result.account_consistency is None


async def test_non_fallback_failure_does_not_probe_accounts() -> None:
    """确保不可回退和单提供方失败均不会触发账号门禁。"""
    for strategy, code in (
        (RouteStrategy.HTTP_FIRST, ProviderFailureCode.EFFECT_UNCERTAIN),
        (RouteStrategy.HTTP_ONLY, ProviderFailureCode.UNAVAILABLE),
        (RouteStrategy.HTTP_FIRST, ProviderFailureCode.UNAVAILABLE),
    ):
        calls: list[ProviderKind] = []
        guard = _Guard(AccountConsistencyStatus.MATCHED)
        with pytest.raises(ProviderError):
            await CapabilityRouter().execute_read(
                strategy,
                http=_failure(calls, ProviderKind.HTTP, code),
                browser=(
                    _success(calls, ProviderKind.BROWSER)
                    if code is ProviderFailureCode.EFFECT_UNCERTAIN
                    else None
                ),
                account_scope=ReadAccountScope.ACCOUNT_SCOPED,
                account_guard=guard,
            )
        assert calls == [ProviderKind.HTTP]
        assert guard.calls == 0


@pytest.mark.parametrize(
    "code",
    [
        ProviderFailureCode.NOT_CONFIGURED,
        ProviderFailureCode.AUTHENTICATION_EXPIRED,
    ],
)
async def test_missing_or_expired_session_bypasses_account_probe(
    code: ProviderFailureCode,
) -> None:
    """确保明确无首选会话时直接使用第二提供方。

    Args:
        code: 允许绕过账号门禁的失败分类。
    """
    calls: list[ProviderKind] = []
    guard = _Guard(AccountConsistencyStatus.DIFFERENT)

    result = await CapabilityRouter().execute_read(
        RouteStrategy.HTTP_FIRST,
        http=_failure(calls, ProviderKind.HTTP, code),
        browser=_success(calls, ProviderKind.BROWSER),
        account_scope=ReadAccountScope.ACCOUNT_SCOPED,
        account_guard=guard,
    )

    assert calls == [ProviderKind.HTTP, ProviderKind.BROWSER]
    assert guard.calls == 0
    assert result.account_consistency is None


async def test_missing_preferred_provider_bypasses_account_probe() -> None:
    """确保未配置的首选实现使用同一绕过规则。"""
    calls: list[ProviderKind] = []
    guard = _Guard(AccountConsistencyStatus.DIFFERENT)

    result = await CapabilityRouter().execute_read(
        RouteStrategy.HTTP_FIRST,
        browser=_success(calls, ProviderKind.BROWSER),
        account_scope=ReadAccountScope.ACCOUNT_SCOPED,
        account_guard=guard,
    )

    assert calls == [ProviderKind.BROWSER]
    assert guard.calls == 0
    assert result.account_consistency is None


@pytest.mark.parametrize(
    "code",
    [
        ProviderFailureCode.UNAVAILABLE,
        ProviderFailureCode.UNSUPPORTED,
        ProviderFailureCode.PAGE_INCOMPATIBLE,
        ProviderFailureCode.TIMEOUT_BEFORE_EFFECT,
        ProviderFailureCode.INVALID_RESULT,
    ],
)
async def test_matched_guard_allows_each_protected_fallback_code(
    code: ProviderFailureCode,
) -> None:
    """确保其余安全失败只有 matched 才调用第二提供方。

    Args:
        code: 必须经过账号门禁的安全失败分类。
    """
    calls: list[ProviderKind] = []
    guard = _Guard(AccountConsistencyStatus.MATCHED)

    result = await CapabilityRouter().execute_read(
        RouteStrategy.HTTP_FIRST,
        http=_failure(calls, ProviderKind.HTTP, code),
        browser=_success(calls, ProviderKind.BROWSER),
        account_scope=ReadAccountScope.ACCOUNT_SCOPED,
        account_guard=guard,
    )

    assert calls == [ProviderKind.HTTP, ProviderKind.BROWSER]
    assert guard.calls == 1
    assert result.account_consistency is AccountConsistencyStatus.MATCHED


async def test_browser_first_uses_the_same_account_gate() -> None:
    """确保浏览器优先路由也在跨提供方前执行门禁。"""
    calls: list[ProviderKind] = []
    guard = _Guard(AccountConsistencyStatus.MATCHED)

    result = await CapabilityRouter().execute_read(
        RouteStrategy.BROWSER_FIRST,
        browser=_failure(
            calls,
            ProviderKind.BROWSER,
            ProviderFailureCode.PAGE_INCOMPATIBLE,
        ),
        http=_success(calls, ProviderKind.HTTP),
        account_scope=ReadAccountScope.ACCOUNT_SCOPED,
        account_guard=guard,
    )

    assert result.provider is ProviderKind.HTTP
    assert result.account_consistency is AccountConsistencyStatus.MATCHED
    assert guard.calls == 1


@pytest.mark.parametrize(
    "status",
    [
        AccountConsistencyStatus.DIFFERENT,
        AccountConsistencyStatus.LOGGED_OUT,
        AccountConsistencyStatus.UNVERIFIED,
    ],
)
async def test_non_matched_status_blocks_second_provider(
    status: AccountConsistencyStatus,
) -> None:
    """确保任何非 matched 结论都无法读取第二提供方。

    Args:
        status: 待验证的阻止结论。
    """
    calls: list[ProviderKind] = []

    with pytest.raises(AccountConsistencyError) as captured:
        await CapabilityRouter().execute_read(
            RouteStrategy.HTTP_FIRST,
            http=_failure(
                calls,
                ProviderKind.HTTP,
                ProviderFailureCode.UNAVAILABLE,
            ),
            browser=_success(calls, ProviderKind.BROWSER),
            account_scope=ReadAccountScope.ACCOUNT_SCOPED,
            account_guard=_Guard(status),
        )

    assert captured.value.status is status
    assert calls == [ProviderKind.HTTP]


@pytest.mark.parametrize(
    "guard",
    [
        None,
        _Guard(RuntimeError("synthetic guard failure")),
        _Guard("invalid status"),
    ],
)
async def test_missing_failed_or_invalid_guard_fails_closed(guard: object) -> None:
    """确保门禁不可用时固定收敛为 unverified。

    Args:
        guard: 缺失、失败或返回非法状态的门禁。
    """
    calls: list[ProviderKind] = []

    with pytest.raises(AccountConsistencyError) as captured:
        await CapabilityRouter().execute_read(
            RouteStrategy.HTTP_FIRST,
            http=_failure(
                calls,
                ProviderKind.HTTP,
                ProviderFailureCode.UNAVAILABLE,
            ),
            browser=_success(calls, ProviderKind.BROWSER),
            account_scope=ReadAccountScope.ACCOUNT_SCOPED,
            account_guard=cast(_Guard | None, guard),
        )

    assert captured.value.status is AccountConsistencyStatus.UNVERIFIED
    assert calls == [ProviderKind.HTTP]


async def test_guard_cancellation_propagates_without_fallback() -> None:
    """确保取消门禁不会被误当作普通 unverified。"""
    calls: list[ProviderKind] = []

    with pytest.raises(asyncio.CancelledError):
        await CapabilityRouter().execute_read(
            RouteStrategy.HTTP_FIRST,
            http=_failure(
                calls,
                ProviderKind.HTTP,
                ProviderFailureCode.UNAVAILABLE,
            ),
            browser=_success(calls, ProviderKind.BROWSER),
            account_scope=ReadAccountScope.ACCOUNT_SCOPED,
            account_guard=_Guard(asyncio.CancelledError()),
        )
    assert calls == [ProviderKind.HTTP]


async def test_route_result_serializes_only_account_conclusion() -> None:
    """确保成功结果不保存挑战、证明或稳定账号标识。"""
    calls: list[ProviderKind] = []
    result = await CapabilityRouter().execute_read(
        RouteStrategy.HTTP_FIRST,
        http=_failure(
            calls,
            ProviderKind.HTTP,
            ProviderFailureCode.UNAVAILABLE,
        ),
        browser=_success(calls, ProviderKind.BROWSER),
        account_scope=ReadAccountScope.ACCOUNT_SCOPED,
        account_guard=_Guard(AccountConsistencyStatus.MATCHED),
    )

    serialized = json.dumps(asdict(result))

    assert '"account_consistency": "matched"' in serialized
    assert "proof" not in serialized
    assert "challenge" not in serialized
    assert "synthetic-account" not in serialized
