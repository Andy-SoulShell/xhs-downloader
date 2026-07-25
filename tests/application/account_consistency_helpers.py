"""账号一致性应用测试使用的替身。"""

from collections.abc import Awaitable, Callable
from typing import Any, cast

from xhs_core.domain import (
    AccountConsistencyStatus,
    ProviderError,
    ProviderFailureCode,
    ProviderKind,
)

type Operation = Callable[[], Awaitable[Any]]


class _Guard:
    """返回预设账号结论或异常的路由测试门禁。"""

    def __init__(self, outcome: object) -> None:
        self.outcome = outcome
        self.calls = 0

    async def verify(self) -> AccountConsistencyStatus:
        """返回预设结论并记录调用次数。

        Returns:
            构造时传入的测试结论。

        Raises:
            BaseException: 构造时传入的合成异常。
        """
        self.calls += 1
        if isinstance(self.outcome, BaseException):
            raise self.outcome
        return cast(AccountConsistencyStatus, self.outcome)


def _success(calls: list[ProviderKind], provider: ProviderKind) -> Operation:
    """构造记录调用并成功返回的测试操作。

    Args:
        calls: 保存提供方调用轨迹的列表。
        provider: 本操作模拟的提供方。

    Returns:
        异步测试操作。
    """

    async def _operation() -> str:
        calls.append(provider)
        return f"{provider.value} result"

    return _operation


def _failure(
    calls: list[ProviderKind],
    provider: ProviderKind,
    code: ProviderFailureCode,
) -> Operation:
    """构造记录调用并抛出类型化失败的测试操作。

    Args:
        calls: 保存提供方调用轨迹的列表。
        provider: 本操作模拟的提供方。
        code: 待抛出的稳定失败分类。

    Returns:
        异步测试操作。
    """

    async def _operation() -> str:
        calls.append(provider)
        raise ProviderError(provider, code, "synthetic safe failure")

    return _operation
