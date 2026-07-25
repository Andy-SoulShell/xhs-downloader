"""跨提供方的一次性账号一致性门禁。"""

import asyncio
import hmac
import math
from collections.abc import Callable

from xhs_core.domain.account_consistency import (
    AccountConsistencyStatus,
    AccountProof,
    AccountProofProvider,
    AccountProofState,
    OneTimeAccountChallenge,
)

type _ChallengeFactory = Callable[[], OneTimeAccountChallenge]


class OneTimeAccountConsistencyGuard:
    """并发比较 HTTP 与浏览器会话的一次性账号证明。

    提供方异常和门禁超时均收敛为 ``unverified``；调用方取消会原样传播，
    并在返回前取消和等待两个子任务，避免后台证明继续运行。

    Args:
        http: HTTP Cookie 会话的证明提供方。
        browser: 当前浏览器会话的证明提供方。
        timeout_seconds: 两个证明合计允许的最长秒数。
        challenge_factory: 一次性挑战工厂，默认使用密码学安全随机数。
    """

    def __init__(
        self,
        http: AccountProofProvider,
        browser: AccountProofProvider,
        *,
        timeout_seconds: float = 5.0,
        challenge_factory: _ChallengeFactory = OneTimeAccountChallenge.generate,
    ) -> None:
        if not math.isfinite(timeout_seconds) or timeout_seconds <= 0:
            raise ValueError("账号一致性校验超时必须为有限正数")
        self._http = http
        self._browser = browser
        self._timeout_seconds = timeout_seconds
        self._challenge_factory = challenge_factory

    async def verify(self) -> AccountConsistencyStatus:
        """并发取得两方证明并返回脱敏比较结论。

        Returns:
            ``matched``、``different``、``logged_out`` 或 ``unverified``。

        Raises:
            asyncio.CancelledError: 调用方取消本次门禁校验。
        """
        challenge = self._challenge_factory()
        tasks = (
            asyncio.create_task(self._request_proof(self._http, challenge)),
            asyncio.create_task(self._request_proof(self._browser, challenge)),
        )
        try:
            async with asyncio.timeout(self._timeout_seconds):
                http_proof, browser_proof = await asyncio.gather(*tasks)
        except TimeoutError:
            return AccountConsistencyStatus.UNVERIFIED
        finally:
            for task in tasks:
                if not task.done():
                    task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
        return self._compare(http_proof, browser_proof)

    async def _request_proof(
        self,
        provider: AccountProofProvider,
        challenge: OneTimeAccountChallenge,
    ) -> AccountProof:
        try:
            proof = await provider.prove_account(challenge)
        except Exception:
            return AccountProof.unverified()
        if not isinstance(proof, AccountProof):
            return AccountProof.unverified()
        return proof

    @staticmethod
    def _compare(
        http_proof: AccountProof,
        browser_proof: AccountProof,
    ) -> AccountConsistencyStatus:
        proofs = (http_proof, browser_proof)
        if any(proof.state is AccountProofState.LOGGED_OUT for proof in proofs):
            return AccountConsistencyStatus.LOGGED_OUT
        if any(proof.state is not AccountProofState.PROVED for proof in proofs):
            return AccountConsistencyStatus.UNVERIFIED
        http_digest = http_proof.comparison_digest
        browser_digest = browser_proof.comparison_digest
        if http_digest is None or browser_digest is None:
            return AccountConsistencyStatus.UNVERIFIED
        if hmac.compare_digest(http_digest, browser_digest):
            return AccountConsistencyStatus.MATCHED
        return AccountConsistencyStatus.DIFFERENT
