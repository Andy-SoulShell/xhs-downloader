"""账号一致性领域类型测试。"""

import copy
import json
import pickle

import pytest
from xhs_core.domain import (
    AccountConsistencyError,
    AccountConsistencyStatus,
    AccountProof,
    AccountProofState,
    OneTimeAccountChallenge,
    ReadAccountScope,
)


def test_account_consistency_enum_values_are_stable() -> None:
    """确保账号范围、证明状态和比较结论可作为稳定协议值。"""
    assert {item.value for item in ReadAccountScope} == {
        "public",
        "account_scoped",
    }
    assert {item.value for item in AccountProofState} == {
        "proved",
        "logged_out",
        "unverified",
    }
    assert {item.value for item in AccountConsistencyStatus} == {
        "matched",
        "different",
        "logged_out",
        "unverified",
    }


def test_challenge_proofs_are_scoped_to_identity_and_challenge() -> None:
    """确保摘要只在同一挑战和同一账号下相等。"""
    first = OneTimeAccountChallenge(b"a" * 32)
    second = OneTimeAccountChallenge(b"b" * 32)

    first_proof = first.prove("synthetic-account-a")

    assert first_proof == first.prove("synthetic-account-a")
    assert first_proof != first.prove("synthetic-account-b")
    assert first_proof != second.prove("synthetic-account-a")
    assert len(first_proof) == 32


def test_challenge_uses_stable_browser_interoperability_vector() -> None:
    """确保 Python 与浏览器 WebCrypto 使用完全相同的证明消息。"""
    challenge = OneTimeAccountChallenge(b"a" * 32, "0" * 32)

    assert challenge.challenge_id == "0" * 32
    assert challenge.export_ephemeral_key() == b"a" * 32
    assert challenge.prove("synthetic-account-a").hex() == (
        "c8ce2c6973290053f8cabc52b33be8c53f7031abe0ee333886c7ab7ae1f505ca"
    )


def test_challenge_rejects_invalid_secret_and_empty_identity() -> None:
    """确保挑战不会接受弱密钥长度或空账号标识。"""
    with pytest.raises(ValueError, match="32 字节"):
        OneTimeAccountChallenge(b"short")
    with pytest.raises(ValueError, match="32 位"):
        OneTimeAccountChallenge(b"a" * 32, "invalid")

    challenge = OneTimeAccountChallenge(b"a" * 32)
    with pytest.raises(ValueError, match="不能为空"):
        challenge.prove("")


def test_challenge_cannot_be_serialized_or_leaked_by_repr() -> None:
    """确保一次性挑战无法进入常见序列化与调试输出。"""
    marker = b"sensitive-account-marker".ljust(32, b"!")
    challenge = OneTimeAccountChallenge(marker)

    assert "sensitive-account-marker" not in repr(challenge)
    with pytest.raises(TypeError):
        json.dumps(challenge)
    with pytest.raises(TypeError, match="禁止序列化"):
        pickle.dumps(challenge)
    with pytest.raises(TypeError, match="禁止序列化"):
        copy.copy(challenge)


def test_account_proof_enforces_state_digest_invariant() -> None:
    """确保证明摘要只存在于 proved 状态且不会进入 repr。"""
    digest = b"d" * 32
    proved = AccountProof.proved(digest)

    assert proved.state is AccountProofState.PROVED
    assert proved.comparison_digest == digest
    assert digest.hex() not in repr(proved)
    assert AccountProof.logged_out().comparison_digest is None
    assert AccountProof.unverified().comparison_digest is None

    with pytest.raises(ValueError, match="32 字节"):
        AccountProof.proved(b"short")
    with pytest.raises(ValueError, match="禁止携带"):
        AccountProof(AccountProofState.UNVERIFIED, digest)


@pytest.mark.parametrize(
    ("status", "message"),
    [
        (
            AccountConsistencyStatus.DIFFERENT,
            "HTTP Cookie 与当前浏览器不是同一账号，已停止个性化读取回退",
        ),
        (
            AccountConsistencyStatus.LOGGED_OUT,
            "至少一个提供方尚未登录，无法确认账号一致，已停止个性化读取回退",
        ),
        (
            AccountConsistencyStatus.UNVERIFIED,
            "无法确认 HTTP Cookie 与当前浏览器账号一致，已停止个性化读取回退",
        ),
    ],
)
def test_account_consistency_error_uses_fixed_safe_message(
    status: AccountConsistencyStatus,
    message: str,
) -> None:
    """确保阻止错误只含固定结论，不携带账号数据。

    Args:
        status: 待构造的阻止结论。
        message: 对应的固定安全文案。
    """
    error = AccountConsistencyError(status)

    assert error.status is status
    assert str(error) == message
    assert "synthetic-account" not in repr(error)


def test_matched_status_cannot_construct_blocking_error() -> None:
    """确保成功结论不会被误构造为阻止错误。"""
    with pytest.raises(ValueError, match="matched"):
        AccountConsistencyError(AccountConsistencyStatus.MATCHED)
