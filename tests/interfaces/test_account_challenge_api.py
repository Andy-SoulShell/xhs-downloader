"""扩展一次性账号挑战 HTTP API 测试。"""

import asyncio

from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from xhs_adapters.sqlite import (
    SqliteBrowserTaskRepository,
    SqliteExtensionCredentialRepository,
)
from xhs_api.browser import create_browser_router
from xhs_core.application import (
    BrowserExecutionService,
    BrowserTaskService,
    ExtensionAccountChallengeChannel,
    ExtensionCredentialService,
)
from xhs_core.domain import AccountProofState, OneTimeAccountChallenge

_EXTENSION_ID = "synthetic-account-proof-extension"
_ORIGIN = f"chrome-extension://{_EXTENSION_ID}"


async def _register(client: AsyncClient) -> dict[str, str]:
    response = await client.post(
        "/browser/extension/register",
        json={"extension_id": _EXTENSION_ID},
        headers={"Origin": _ORIGIN},
    )
    return {
        "Origin": _ORIGIN,
        "Authorization": f"Bearer {response.json()['token']}",
        "X-Extension-Id": _EXTENSION_ID,
    }


async def test_account_challenge_round_trip_never_creates_browser_task(
    tmp_path,
) -> None:
    """确保挑战通过独立内存 API 完成且 SQLite 任务表保持为空。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    database = tmp_path.joinpath("state.db")
    repository = SqliteBrowserTaskRepository(database)
    tasks = BrowserTaskService(repository)
    channel = ExtensionAccountChallengeChannel()
    api = FastAPI()
    api.include_router(
        create_browser_router(
            tasks,
            BrowserExecutionService(repository, lease_seconds=60),
            ExtensionCredentialService(SqliteExtensionCredentialRepository(database)),
            channel,
            lambda _: True,
        )
    )
    challenge = OneTimeAccountChallenge(b"a" * 32, "0" * 32)
    async with AsyncClient(
        transport=ASGITransport(app=api),
        base_url="http://127.0.0.1:5556",
    ) as client:
        headers = await _register(client)
        waiting = asyncio.create_task(channel.request(challenge, _EXTENSION_ID))
        await asyncio.sleep(0)
        unauthorized = await client.post("/browser/extension/account-challenges/claim")
        claimed = await client.post(
            "/browser/extension/account-challenges/claim",
            headers=headers,
        )
        payload = claimed.json()
        no_lease = await client.post(
            f"/browser/extension/account-challenges/{payload['challenge_id']}/answer",
            json={"status": "proved", "proof": "a" * 64},
            headers=headers,
        )
        wrong_lease = await client.post(
            f"/browser/extension/account-challenges/{payload['challenge_id']}/answer",
            json={"status": "proved", "proof": "a" * 64},
            headers={
                **headers,
                "X-Account-Challenge-Lease": "wrong-lease",
            },
        )
        proof_hex = challenge.prove("synthetic-account").hex()
        accepted = await client.post(
            f"/browser/extension/account-challenges/{payload['challenge_id']}/answer",
            json={"status": "proved", "proof": proof_hex},
            headers={
                **headers,
                "X-Account-Challenge-Lease": payload["lease_token"],
            },
        )
        duplicate = await client.post(
            f"/browser/extension/account-challenges/{payload['challenge_id']}/answer",
            json={"status": "proved", "proof": proof_hex},
            headers={
                **headers,
                "X-Account-Challenge-Lease": payload["lease_token"],
            },
        )
        listed = await client.get("/browser/tasks")

    proof = await waiting
    assert unauthorized.status_code == 401
    assert claimed.status_code == 200
    assert payload["algorithm"] == "HMAC-SHA-256"
    assert payload["challenge_key"] == ("YWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWE")
    assert "synthetic-account" not in claimed.text
    assert no_lease.status_code == 401
    assert wrong_lease.status_code == 409
    assert accepted.status_code == 204
    assert duplicate.status_code == 409
    assert proof.state is AccountProofState.PROVED
    assert proof.comparison_digest == bytes.fromhex(proof_hex)
    assert listed.json() == []
    await channel.close()
