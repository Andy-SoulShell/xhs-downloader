"""浏览器扩展账号证明的一次性内存通道。"""

import asyncio
import hmac
import math
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from hashlib import sha256
from secrets import token_urlsafe

from xhs_core.domain import AccountProof, OneTimeAccountChallenge


@dataclass(frozen=True, slots=True)
class ExtensionAccountChallengeClaim:
    """扩展在内存中领取的一次性账号挑战。

    Attributes:
        challenge_id: 不含账号信息的随机挑战标识。
        challenge_key: 仅供当前隔离脚本计算 HMAC 的临时密钥。
        lease_token: 只在当前领取响应中返回的随机租约。
        expires_at: 挑战整体失效时间。
    """

    challenge_id: str
    challenge_key: bytes = field(repr=False)
    lease_token: str = field(repr=False)
    expires_at: datetime


@dataclass(slots=True)
class _PendingChallenge:
    challenge: OneTimeAccountChallenge
    result: asyncio.Future[AccountProof]
    expires_at: float
    expires_at_wall: datetime
    allowed_extension_id: str
    claimed_extension_id: str | None = None
    lease_digest: bytes | None = field(default=None, repr=False)
    lease_expires_at: float = 0


class ExtensionAccountChallengeChannel:
    """在 API 进程内传递短期扩展账号挑战。

    通道不依赖仓储，进程退出即丢弃全部挑战；密钥、租约和证明只存在于
    内存局部变量。每个挑战只能由指定的在线扩展领取和回答。

    Args:
        ttl_seconds: 挑战从创建起允许存在的秒数。
        lease_seconds: 扩展领取后回答所需租约秒数。
        capacity: 同时存在的挑战上限。
    """

    def __init__(
        self,
        *,
        ttl_seconds: float = 45,
        lease_seconds: float = 15,
        capacity: int = 16,
    ) -> None:
        if (
            not math.isfinite(ttl_seconds)
            or not math.isfinite(lease_seconds)
            or ttl_seconds <= 0
            or lease_seconds <= 0
            or lease_seconds > ttl_seconds
            or capacity <= 0
        ):
            raise ValueError("扩展账号挑战通道参数无效")
        self._ttl_seconds = ttl_seconds
        self._lease_seconds = lease_seconds
        self._capacity = capacity
        self._condition = asyncio.Condition()
        self._pending: dict[str, _PendingChallenge] = {}
        self._closed = False

    async def request(
        self,
        challenge: OneTimeAccountChallenge,
        allowed_extension_id: str,
    ) -> AccountProof:
        """发布挑战并等待指定扩展返回脱敏证明。

        Args:
            challenge: 当前路由门禁创建的一次性挑战。
            allowed_extension_id: 本轮唯一允许领取的在线扩展 ID。

        Returns:
            扩展证明；容量不足、超时、关闭或取消时返回无法确认。
        """
        if not allowed_extension_id:
            return AccountProof.unverified()
        loop = asyncio.get_running_loop()
        result: asyncio.Future[AccountProof] = loop.create_future()
        pending = _PendingChallenge(
            challenge=challenge,
            result=result,
            expires_at=loop.time() + self._ttl_seconds,
            expires_at_wall=datetime.now(UTC) + timedelta(seconds=self._ttl_seconds),
            allowed_extension_id=allowed_extension_id,
        )
        async with self._condition:
            self._cleanup_locked(loop.time())
            if self._closed or len(self._pending) >= self._capacity:
                return AccountProof.unverified()
            if challenge.challenge_id in self._pending:
                return AccountProof.unverified()
            self._pending[challenge.challenge_id] = pending
            self._condition.notify_all()
        try:
            async with asyncio.timeout(self._ttl_seconds):
                return await result
        except TimeoutError:
            return AccountProof.unverified()
        finally:
            async with self._condition:
                if self._pending.get(challenge.challenge_id) is pending:
                    self._pending.pop(challenge.challenge_id, None)
                self._condition.notify_all()

    async def claim(
        self,
        extension_id: str,
        wait_seconds: float,
    ) -> ExtensionAccountChallengeClaim | None:
        """让扩展有界等待并领取最早可用挑战。

        Args:
            extension_id: 已通过 Bearer 校验的扩展 ID。
            wait_seconds: 最长等待秒数，范围为零到三十秒。

        Returns:
            绑定当前扩展的一次性领取；超时或没有任务时返回 ``None``。

        Raises:
            ValueError: 等待参数无效。
        """
        if not math.isfinite(wait_seconds) or not 0 <= wait_seconds <= 30:
            raise ValueError("账号挑战领取等待时间必须在 0 到 30 秒之间")
        loop = asyncio.get_running_loop()
        deadline = loop.time() + wait_seconds
        async with self._condition:
            while True:
                now = loop.time()
                self._cleanup_locked(now)
                if self._closed:
                    return None
                claim = self._claim_locked(extension_id, now)
                if claim:
                    return claim
                remaining = deadline - now
                if remaining <= 0:
                    return None
                try:
                    async with asyncio.timeout(min(remaining, 1)):
                        await self._condition.wait()
                except TimeoutError:
                    continue

    async def answer(
        self,
        challenge_id: str,
        extension_id: str,
        lease_token: str,
        proof: AccountProof,
    ) -> bool:
        """提交扩展计算的证明并一次性消费挑战。

        Args:
            challenge_id: 领取响应中的挑战标识。
            extension_id: 当前已认证扩展 ID。
            lease_token: 领取响应中的原始租约。
            proof: 页面只返回状态和 HMAC 的脱敏证明。

        Returns:
            挑战、扩展和租约均有效且首次提交时返回真。
        """
        loop = asyncio.get_running_loop()
        async with self._condition:
            self._cleanup_locked(loop.time())
            pending = self._pending.get(challenge_id)
            if (
                not pending
                or pending.claimed_extension_id != extension_id
                or pending.lease_digest is None
                or not lease_token
                or not hmac.compare_digest(
                    pending.lease_digest,
                    _lease_digest(lease_token),
                )
            ):
                return False
            self._pending.pop(challenge_id, None)
            if not pending.result.done():
                pending.result.set_result(proof)
            self._condition.notify_all()
            return True

    async def close(self) -> None:
        """关闭通道并把尚未完成的证明收敛为无法确认。"""
        async with self._condition:
            self._closed = True
            for pending in self._pending.values():
                if not pending.result.done():
                    pending.result.set_result(AccountProof.unverified())
            self._pending.clear()
            self._condition.notify_all()

    def _claim_locked(
        self,
        extension_id: str,
        now: float,
    ) -> ExtensionAccountChallengeClaim | None:
        if any(
            pending.claimed_extension_id == extension_id
            for pending in self._pending.values()
        ):
            return None
        for pending in self._pending.values():
            if (
                pending.claimed_extension_id is not None
                or pending.allowed_extension_id != extension_id
            ):
                continue
            token = token_urlsafe(24)
            pending.claimed_extension_id = extension_id
            pending.lease_digest = _lease_digest(token)
            pending.lease_expires_at = min(
                pending.expires_at,
                now + self._lease_seconds,
            )
            return ExtensionAccountChallengeClaim(
                challenge_id=pending.challenge.challenge_id,
                challenge_key=pending.challenge.export_ephemeral_key(),
                lease_token=token,
                expires_at=pending.expires_at_wall,
            )
        return None

    def _cleanup_locked(self, now: float) -> None:
        expired: list[str] = []
        for challenge_id, pending in self._pending.items():
            if pending.expires_at <= now:
                if not pending.result.done():
                    pending.result.set_result(AccountProof.unverified())
                expired.append(challenge_id)
                continue
            if (
                pending.claimed_extension_id is not None
                and pending.lease_expires_at <= now
            ):
                pending.claimed_extension_id = None
                pending.lease_digest = None
                pending.lease_expires_at = 0
        for challenge_id in expired:
            self._pending.pop(challenge_id, None)


def _lease_digest(token: str) -> bytes:
    return sha256(token.encode("utf-8")).digest()
