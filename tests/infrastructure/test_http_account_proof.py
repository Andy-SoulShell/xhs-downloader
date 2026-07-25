"""Cookie HTTP 一次性账号证明测试。"""

import json
from pathlib import Path

import httpx
import pytest
from xhs_adapters import HttpReadProvider
from xhs_adapters.config import AppSettings
from xhs_core.domain import (
    AccountProofState,
    OneTimeAccountChallenge,
    ProviderError,
    ProviderFailureCode,
)


def _html(info: dict) -> str:
    state = {"user": {"userInfo": {"value": info}}}
    return (
        "<script>window.__INITIAL_STATE__="
        f"{json.dumps(state, ensure_ascii=False)}</script>"
    )


def _provider(
    tmp_path: Path,
    info: dict,
    *,
    cookie: str = "session=synthetic-cookie",
) -> HttpReadProvider:
    return HttpReadProvider(
        AppSettings(
            work_path=tmp_path,
            cookie=cookie,
            max_retry=0,
        ),
        transport=httpx.MockTransport(lambda _: httpx.Response(200, text=_html(info))),
    )


async def test_http_provider_returns_same_one_time_hmac(tmp_path: Path) -> None:
    """确保稳定账号标识只被转换为本轮 HMAC。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    challenge = OneTimeAccountChallenge(b"a" * 32, "0" * 32)
    async with _provider(
        tmp_path,
        {"guest": False, "userId": "synthetic-account-a"},
    ) as provider:
        proof = await provider.prove_account(challenge)

    assert proof.state is AccountProofState.PROVED
    assert proof.comparison_digest == challenge.prove("synthetic-account-a")


@pytest.mark.parametrize(
    ("info", "state"),
    [
        ({"guest": True}, AccountProofState.LOGGED_OUT),
        (
            {"guest": False, "userId": ""},
            AccountProofState.UNVERIFIED,
        ),
        (
            {"userId": "stale-account"},
            AccountProofState.UNVERIFIED,
        ),
    ],
)
async def test_http_provider_fails_closed_for_unusable_identity(
    tmp_path: Path,
    info: dict,
    state: AccountProofState,
) -> None:
    """确保访客与不可靠状态不会生成可比较摘要。

    Args:
        tmp_path: Pytest 提供的临时目录。
        info: 合成页面账号状态。
        state: 预期的脱敏证明状态。
    """
    async with _provider(tmp_path, info) as provider:
        proof = await provider.prove_account(OneTimeAccountChallenge.generate())

    assert proof.state is state
    assert proof.comparison_digest is None


async def test_http_provider_requires_cookie_before_proof(tmp_path: Path) -> None:
    """确保未配置 Cookie 时不会发送账号探测请求。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    async with _provider(tmp_path, {}, cookie=" ") as provider:
        with pytest.raises(ProviderError) as captured:
            await provider.prove_account(OneTimeAccountChallenge.generate())

    assert captured.value.code is ProviderFailureCode.NOT_CONFIGURED
