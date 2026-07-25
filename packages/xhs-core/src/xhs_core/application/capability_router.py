"""HTTP 与浏览器能力的安全统一路由。"""

from collections.abc import Awaitable, Callable

from xhs_core.domain.account_consistency import (
    AccountConsistencyError,
    AccountConsistencyGuard,
    AccountConsistencyStatus,
    ReadAccountScope,
)
from xhs_core.domain.capability_routing import (
    ProviderError,
    ProviderFailure,
    ProviderFailureCode,
    ProviderKind,
    RoutedCapabilityResult,
    RoutePolicyError,
    RouteStrategy,
)

type _ProviderCallable[T] = Callable[[], Awaitable[T]]

_PROVIDER_ORDER = {
    RouteStrategy.HTTP_ONLY: (ProviderKind.HTTP,),
    RouteStrategy.BROWSER_ONLY: (ProviderKind.BROWSER,),
    RouteStrategy.HTTP_FIRST: (ProviderKind.HTTP, ProviderKind.BROWSER),
    RouteStrategy.BROWSER_FIRST: (ProviderKind.BROWSER, ProviderKind.HTTP),
}
_ACCOUNT_GUARD_BYPASS_CODES = frozenset(
    {
        ProviderFailureCode.NOT_CONFIGURED,
        ProviderFailureCode.AUTHENTICATION_EXPIRED,
    }
)


class CapabilityRouter:
    """按安全策略编排同一能力的 HTTP 与浏览器实现。

    只读调用只会在提供方抛出明确可回退的 ``ProviderError`` 时尝试下一
    提供方。写调用固定使用浏览器且至多调用一次。
    """

    async def execute_read[T](
        self,
        strategy: RouteStrategy,
        *,
        http: _ProviderCallable[T] | None = None,
        browser: _ProviderCallable[T] | None = None,
        account_scope: ReadAccountScope = ReadAccountScope.PUBLIC,
        account_guard: AccountConsistencyGuard | None = None,
    ) -> RoutedCapabilityResult[T]:
        """执行可安全回退的只读能力。

        Args:
            strategy: 提供方选择和调用顺序。
            http: 可选 HTTP 实现。
            browser: 可选浏览器实现。
            account_scope: 能力是否依赖当前登录账号。
            account_guard: 受账号保护能力回退前使用的一致性门禁。

        Returns:
            包含实际提供方和回退原因的结构化成功结果。

        Raises:
            ProviderError: 唯一提供方失败、失败不可安全回退，或回退也失败。
            AccountConsistencyError: 无法证明两个提供方属于同一账号。
        """
        providers = {
            ProviderKind.HTTP: http,
            ProviderKind.BROWSER: browser,
        }
        fallback_reason: ProviderFailure | None = None
        account_consistency: AccountConsistencyStatus | None = None
        attempts: list[ProviderKind] = []
        order = _PROVIDER_ORDER[strategy]
        for index, provider in enumerate(order):
            attempts.append(provider)
            try:
                value = await self._invoke(provider, providers[provider])
            except ProviderError as error:
                has_fallback = index + 1 < len(order)
                if not has_fallback or not error.safe_to_fallback:
                    raise
                fallback_reason = error.as_failure()
                if providers[order[index + 1]] is not None:
                    account_consistency = await self._guard_account_fallback(
                        account_scope,
                        account_guard,
                        error.code,
                    )
                continue
            return RoutedCapabilityResult(
                value=value,
                provider=provider,
                strategy=strategy,
                fallback_used=fallback_reason is not None,
                fallback_reason=fallback_reason,
                attempted_providers=tuple(attempts),
                account_consistency=account_consistency,
            )
        raise AssertionError("路由顺序至少应包含一个提供方")

    async def execute_write[T](
        self,
        strategy: RouteStrategy,
        *,
        browser: _ProviderCallable[T] | None = None,
    ) -> RoutedCapabilityResult[T]:
        """执行禁止跨提供方重试的写能力。

        Args:
            strategy: 必须为 ``browser_only``。
            browser: 可选浏览器写能力实现。

        Returns:
            固定由浏览器产生的结构化成功结果。

        Raises:
            RoutePolicyError: 写操作配置了非 ``browser_only`` 策略。
            ProviderError: 浏览器未配置或执行失败。
        """
        if strategy is not RouteStrategy.BROWSER_ONLY:
            raise RoutePolicyError("写操作仅支持 browser_only 路由策略")
        value = await self._invoke(ProviderKind.BROWSER, browser)
        return RoutedCapabilityResult(
            value=value,
            provider=ProviderKind.BROWSER,
            strategy=strategy,
            fallback_used=False,
            fallback_reason=None,
            attempted_providers=(ProviderKind.BROWSER,),
        )

    async def _invoke[T](
        self,
        provider: ProviderKind,
        operation: _ProviderCallable[T] | None,
    ) -> T:
        if operation is None:
            raise ProviderError(
                provider,
                ProviderFailureCode.NOT_CONFIGURED,
                f"{provider.value} 提供方尚未配置",
            )
        return await operation()

    async def _guard_account_fallback(
        self,
        account_scope: ReadAccountScope,
        account_guard: AccountConsistencyGuard | None,
        failure_code: ProviderFailureCode,
    ) -> AccountConsistencyStatus | None:
        if account_scope is ReadAccountScope.PUBLIC:
            return None
        if failure_code in _ACCOUNT_GUARD_BYPASS_CODES:
            return None
        status = await self._verify_account_consistency(account_guard)
        if status is not AccountConsistencyStatus.MATCHED:
            raise AccountConsistencyError(status)
        return status

    async def _verify_account_consistency(
        self,
        account_guard: AccountConsistencyGuard | None,
    ) -> AccountConsistencyStatus:
        if account_guard is None:
            return AccountConsistencyStatus.UNVERIFIED
        try:
            status = await account_guard.verify()
        except Exception:
            return AccountConsistencyStatus.UNVERIFIED
        if not isinstance(status, AccountConsistencyStatus):
            return AccountConsistencyStatus.UNVERIFIED
        return status
