"""浏览器扩展账号挑战内存通道测试。"""

import asyncio

from xhs_core.application import ExtensionAccountChallengeChannel
from xhs_core.domain import (
    AccountProof,
    AccountProofState,
    OneTimeAccountChallenge,
)


async def test_channel_binds_claim_and_answer_to_one_extension() -> None:
    """确保挑战只由指定扩展凭租约回答且只能消费一次。"""
    channel = ExtensionAccountChallengeChannel()
    challenge = OneTimeAccountChallenge(b"a" * 32, "0" * 32)
    waiting = asyncio.create_task(channel.request(challenge, "extension-a"))
    await asyncio.sleep(0)

    assert await channel.claim("extension-b", 0) is None
    claim = await channel.claim("extension-a", 0)

    assert claim is not None
    assert claim.challenge_id == challenge.challenge_id
    assert claim.challenge_key == b"a" * 32
    assert "a" * 32 not in repr(claim)
    proof = AccountProof.proved(challenge.prove("synthetic-account"))
    assert (
        await channel.answer(
            claim.challenge_id,
            "extension-b",
            claim.lease_token,
            proof,
        )
        is False
    )
    assert (
        await channel.answer(
            claim.challenge_id,
            "extension-a",
            "wrong-lease",
            proof,
        )
        is False
    )
    assert (
        await channel.answer(
            claim.challenge_id,
            "extension-a",
            claim.lease_token,
            proof,
        )
        is True
    )
    result = await waiting

    assert result.state is AccountProofState.PROVED
    assert result.comparison_digest == proof.comparison_digest
    assert (
        await channel.answer(
            claim.challenge_id,
            "extension-a",
            claim.lease_token,
            proof,
        )
        is False
    )
    await channel.close()


async def test_expired_claim_can_be_reclaimed_with_a_new_lease() -> None:
    """确保过期领取不会永久占用挑战且旧租约失效。"""
    channel = ExtensionAccountChallengeChannel(
        ttl_seconds=0.3,
        lease_seconds=0.03,
    )
    challenge = OneTimeAccountChallenge(b"b" * 32, "1" * 32)
    waiting = asyncio.create_task(channel.request(challenge, "extension-a"))
    await asyncio.sleep(0)
    first = await channel.claim("extension-a", 0)
    assert first is not None

    await asyncio.sleep(0.04)
    second = await channel.claim("extension-a", 0)

    assert second is not None
    assert second.lease_token != first.lease_token
    assert (
        await channel.answer(
            first.challenge_id,
            "extension-a",
            first.lease_token,
            AccountProof.logged_out(),
        )
        is False
    )
    assert (
        await channel.answer(
            second.challenge_id,
            "extension-a",
            second.lease_token,
            AccountProof.logged_out(),
        )
        is True
    )
    assert (await waiting).state is AccountProofState.LOGGED_OUT
    await channel.close()


async def test_channel_capacity_timeout_and_close_fail_closed() -> None:
    """确保容量、整体超时和关闭都收敛为无法确认。"""
    channel = ExtensionAccountChallengeChannel(
        ttl_seconds=0.04,
        lease_seconds=0.02,
        capacity=1,
    )
    first = asyncio.create_task(
        channel.request(
            OneTimeAccountChallenge(b"c" * 32, "2" * 32),
            "extension-a",
        )
    )
    await asyncio.sleep(0)
    second = await channel.request(
        OneTimeAccountChallenge(b"d" * 32, "3" * 32),
        "extension-a",
    )

    assert second.state is AccountProofState.UNVERIFIED
    assert (await first).state is AccountProofState.UNVERIFIED

    third = asyncio.create_task(
        channel.request(
            OneTimeAccountChallenge(b"e" * 32, "4" * 32),
            "extension-a",
        )
    )
    await asyncio.sleep(0)
    await channel.close()

    assert (await third).state is AccountProofState.UNVERIFIED
    assert await channel.claim("extension-a", 0) is None
