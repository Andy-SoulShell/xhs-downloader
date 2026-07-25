"""一次性账号一致性门禁测试。"""

import asyncio
from typing import cast

import pytest
from xhs_core.application import OneTimeAccountConsistencyGuard
from xhs_core.domain import (
    AccountConsistencyStatus,
    AccountProof,
    OneTimeAccountChallenge,
)


class _IdentityProvider:
    """使用合成账号标识生成证明的测试提供方。"""

    def __init__(self, identity: str) -> None:
        self.identity = identity
        self.challenges: list[OneTimeAccountChallenge] = []

    async def prove_account(
        self,
        challenge: OneTimeAccountChallenge,
    ) -> AccountProof:
        """返回合成账号的一次性证明。

        Args:
            challenge: 本轮测试使用的一次性挑战。

        Returns:
            对合成账号标识生成的证明。
        """
        self.challenges.append(challenge)
        return AccountProof.proved(challenge.prove(self.identity))


class _WaitingIdentityProvider(_IdentityProvider):
    """等待对方启动后再返回证明的并发测试提供方。"""

    def __init__(
        self,
        identity: str,
        started: asyncio.Event,
        peer_started: asyncio.Event,
    ) -> None:
        super().__init__(identity)
        self.started = started
        self.peer_started = peer_started

    async def prove_account(
        self,
        challenge: OneTimeAccountChallenge,
    ) -> AccountProof:
        """证明两个提供方在同一时间窗内运行。

        Args:
            challenge: 本轮测试使用的一次性挑战。

        Returns:
            对合成账号标识生成的证明。
        """
        self.started.set()
        await self.peer_started.wait()
        return await super().prove_account(challenge)


class _StaticProvider:
    """返回预设状态的测试提供方。"""

    def __init__(self, proof: AccountProof) -> None:
        self.proof = proof

    async def prove_account(
        self,
        challenge: OneTimeAccountChallenge,
    ) -> AccountProof:
        """返回预设证明。

        Args:
            challenge: 本轮测试使用但无需读取的挑战。

        Returns:
            构造时传入的证明。
        """
        del challenge
        return self.proof


class _FailingProvider:
    """始终以未分类异常失败的测试提供方。"""

    async def prove_account(
        self,
        challenge: OneTimeAccountChallenge,
    ) -> AccountProof:
        """抛出不含账号数据的合成异常。

        Args:
            challenge: 本轮测试使用但无需读取的挑战。

        Raises:
            RuntimeError: 始终抛出以验证失败收敛。
        """
        del challenge
        raise RuntimeError("synthetic proof failure")


class _InvalidProvider:
    """返回违反端口约定值的测试提供方。"""

    async def prove_account(
        self,
        challenge: OneTimeAccountChallenge,
    ) -> AccountProof:
        """返回非证明对象。

        Args:
            challenge: 本轮测试使用但无需读取的挑战。

        Returns:
            仅用于验证运行时防御的非法对象。
        """
        del challenge
        return cast(AccountProof, object())


class _BlockingProvider:
    """等待取消并记录清理完成的测试提供方。"""

    def __init__(self) -> None:
        self.started = asyncio.Event()
        self.cancelled = asyncio.Event()

    async def prove_account(
        self,
        challenge: OneTimeAccountChallenge,
    ) -> AccountProof:
        """阻塞到任务被取消。

        Args:
            challenge: 本轮测试使用但无需读取的挑战。

        Raises:
            asyncio.CancelledError: 门禁超时或调用方取消任务。
        """
        del challenge
        self.started.set()
        try:
            await asyncio.Event().wait()
        except asyncio.CancelledError:
            self.cancelled.set()
            raise
        raise AssertionError("阻塞证明不应自然结束")


async def test_guard_fetches_both_proofs_concurrently() -> None:
    """确保两个证明并发取得且同账号返回 matched。"""
    http_started = asyncio.Event()
    browser_started = asyncio.Event()
    http = _WaitingIdentityProvider(
        "synthetic-account-a",
        http_started,
        browser_started,
    )
    browser = _WaitingIdentityProvider(
        "synthetic-account-a",
        browser_started,
        http_started,
    )

    result = await OneTimeAccountConsistencyGuard(
        http,
        browser,
        timeout_seconds=1,
    ).verify()

    assert result is AccountConsistencyStatus.MATCHED
    assert http.challenges == browser.challenges


async def test_guard_uses_fresh_challenge_for_each_verification() -> None:
    """确保不同校验不会复用可关联的一次性挑战。"""
    http = _IdentityProvider("synthetic-account-a")
    browser = _IdentityProvider("synthetic-account-a")
    guard = OneTimeAccountConsistencyGuard(http, browser)

    assert await guard.verify() is AccountConsistencyStatus.MATCHED
    assert await guard.verify() is AccountConsistencyStatus.MATCHED

    assert http.challenges[0] is browser.challenges[0]
    assert http.challenges[1] is browser.challenges[1]
    assert http.challenges[0] is not http.challenges[1]


async def test_guard_reports_different_accounts() -> None:
    """确保不同账号只返回 different 结论。"""
    guard = OneTimeAccountConsistencyGuard(
        _IdentityProvider("synthetic-account-a"),
        _IdentityProvider("synthetic-account-b"),
    )

    assert await guard.verify() is AccountConsistencyStatus.DIFFERENT


@pytest.mark.parametrize(
    ("provider", "expected"),
    [
        (
            _StaticProvider(AccountProof.logged_out()),
            AccountConsistencyStatus.LOGGED_OUT,
        ),
        (
            _StaticProvider(AccountProof.unverified()),
            AccountConsistencyStatus.UNVERIFIED,
        ),
        (_FailingProvider(), AccountConsistencyStatus.UNVERIFIED),
        (_InvalidProvider(), AccountConsistencyStatus.UNVERIFIED),
    ],
)
async def test_guard_reduces_non_proved_results_to_safe_status(
    provider: object,
    expected: AccountConsistencyStatus,
) -> None:
    """确保未登录、失败和非法响应都不会误判为同账号。

    Args:
        provider: 替代 HTTP 侧的异常测试提供方。
        expected: 预期的脱敏比较结论。
    """
    guard = OneTimeAccountConsistencyGuard(
        cast(_StaticProvider, provider),
        _IdentityProvider("synthetic-account-a"),
    )

    assert await guard.verify() is expected


async def test_guard_timeout_cancels_and_awaits_both_providers() -> None:
    """确保超时返回 unverified 且不遗留后台证明。"""
    http = _BlockingProvider()
    browser = _BlockingProvider()
    guard = OneTimeAccountConsistencyGuard(http, browser, timeout_seconds=0.05)

    assert await guard.verify() is AccountConsistencyStatus.UNVERIFIED
    assert http.started.is_set()
    assert browser.started.is_set()
    assert http.cancelled.is_set()
    assert browser.cancelled.is_set()


async def test_guard_caller_cancellation_propagates_after_child_cleanup() -> None:
    """确保调用方取消不会被收敛为 unverified。"""
    http = _BlockingProvider()
    browser = _BlockingProvider()
    task = asyncio.create_task(OneTimeAccountConsistencyGuard(http, browser).verify())
    await asyncio.gather(http.started.wait(), browser.started.wait())

    task.cancel()

    with pytest.raises(asyncio.CancelledError):
        await task
    assert http.cancelled.is_set()
    assert browser.cancelled.is_set()


@pytest.mark.parametrize("timeout_seconds", [0, -1, float("inf"), float("nan")])
def test_guard_rejects_invalid_timeout(timeout_seconds: float) -> None:
    """确保门禁只接受有限正数超时。

    Args:
        timeout_seconds: 待拒绝的异常超时值。
    """
    with pytest.raises(ValueError, match="有限正数"):
        OneTimeAccountConsistencyGuard(
            _IdentityProvider("synthetic-account-a"),
            _IdentityProvider("synthetic-account-a"),
            timeout_seconds=timeout_seconds,
        )
