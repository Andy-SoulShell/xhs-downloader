"""统一读取运行时的扩展账号证明适配器测试。"""

import asyncio
from datetime import UTC, datetime, timedelta
from typing import cast

from xhs_api.account_proof_runtime import ExtensionAccountProofProvider
from xhs_core.application import (
    ExtensionAccountChallengeChannel,
    ExtensionCredentialService,
)
from xhs_core.domain import (
    AccountProof,
    AccountProofState,
    ExtensionPresence,
    OneTimeAccountChallenge,
)


class _Credentials:
    """返回固定扩展在线快照。"""

    def __init__(self, presences: list[ExtensionPresence]) -> None:
        self.presences = presences

    async def list_presence(self) -> list[ExtensionPresence]:
        """返回合成扩展快照。

        Returns:
            构造时提供的扩展列表。
        """
        return self.presences


def _presence(extension_id: str, age_seconds: float = 0) -> ExtensionPresence:
    now = datetime.now(UTC)
    return ExtensionPresence(
        extension_id=extension_id,
        registered_at=now,
        last_seen_at=now - timedelta(seconds=age_seconds),
    )


async def test_extension_provider_uses_only_online_extension() -> None:
    """确保唯一在线扩展能完成当前挑战。"""
    channel = ExtensionAccountChallengeChannel()
    provider = ExtensionAccountProofProvider(
        channel,
        cast(
            ExtensionCredentialService,
            _Credentials([_presence("extension-a")]),
        ),
    )
    challenge = OneTimeAccountChallenge(b"a" * 32, "0" * 32)
    operation = asyncio.create_task(provider.prove_account(challenge))
    claim = await channel.claim("extension-a", 0.1)
    assert claim is not None
    expected = AccountProof.proved(challenge.prove("synthetic-account"))

    assert (
        await channel.answer(
            claim.challenge_id,
            "extension-a",
            claim.lease_token,
            expected,
        )
        is True
    )
    result = await operation

    assert result.state is AccountProofState.PROVED
    assert result.comparison_digest == expected.comparison_digest
    await channel.close()


async def test_extension_provider_rejects_ambiguous_presence() -> None:
    """确保零个、过期或多个在线扩展都安全拒绝混合回退。"""
    for presences in (
        [],
        [_presence("stale", age_seconds=76)],
        [_presence("extension-a"), _presence("extension-b")],
    ):
        channel = ExtensionAccountChallengeChannel()
        provider = ExtensionAccountProofProvider(
            channel,
            cast(ExtensionCredentialService, _Credentials(presences)),
        )

        result = await provider.prove_account(OneTimeAccountChallenge.generate())

        assert result.state is AccountProofState.UNVERIFIED
        assert await channel.claim("extension-a", 0) is None
        await channel.close()
