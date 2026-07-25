"""受管 Chromium 一次性账号证明测试。"""

import asyncio
from typing import Any, cast

from xhs_adapters import ManagedAccountProofProvider
from xhs_adapters.managed_page_session import ManagedPageSession
from xhs_core.application import ManagedBrowserExecutionGate
from xhs_core.domain import (
    AccountProofState,
    ManagedBrowserState,
    ManagedBrowserStatus,
    OneTimeAccountChallenge,
)
from xhs_core.domain.browser_ports import ManagedBrowserController


class _Controller:
    """返回固定脱敏受管浏览器状态。"""

    def __init__(self, status: ManagedBrowserStatus) -> None:
        self.snapshot = status

    async def status(self) -> ManagedBrowserStatus:
        """返回当前测试状态。

        Returns:
            构造时提供的状态。
        """
        return self.snapshot


class _Page:
    """记录短生命周期页面操作的测试替身。"""

    def __init__(self, response: object) -> None:
        self.response = response
        self.closed = False
        self.goto_calls: list[str] = []
        self.proof_payload: dict[str, str] | None = None

    @property
    def url(self) -> str:
        """返回固定探索页地址。

        Returns:
            合成探索页地址。
        """
        return "https://www.xiaohongshu.com/explore/"

    async def goto(self, url: str, **options: Any) -> None:
        """记录受信任导航。

        Args:
            url: 目标页面。
            **options: 导航等待选项。
        """
        del options
        self.goto_calls.append(url)

    async def evaluate(self, expression: str, arg: Any = None) -> object:
        """记录证明参数并返回合成页面响应。

        Args:
            expression: 固定注入源码或证明表达式。
            arg: 证明表达式的临时挑战。

        Returns:
            注入阶段返回空值，证明阶段返回合成响应。
        """
        del expression
        if isinstance(arg, dict):
            self.proof_payload = arg
            return self.response
        return None

    async def close(self) -> None:
        """记录页面已关闭。"""
        self.closed = True


class _Session:
    """记录 CDP 连接与清理的测试会话。"""

    def __init__(self, page: _Page) -> None:
        self.page = page
        self.connected_port: int | None = None
        self.closed = False

    async def connect(self, port: int) -> None:
        """记录 CDP 端口。

        Args:
            port: 合成 CDP 端口。
        """
        self.connected_port = port

    async def new_page(self) -> _Page:
        """返回合成页面。

        Returns:
            当前测试页面。
        """
        return self.page

    async def close(self) -> None:
        """记录会话已断开。"""
        self.closed = True


def _status(
    state: ManagedBrowserState = ManagedBrowserState.RUNNING,
    *,
    owned: bool = True,
) -> ManagedBrowserStatus:
    return ManagedBrowserStatus(
        installed=True,
        state=state,
        cdp_port=9222 if state is ManagedBrowserState.RUNNING else None,
        owned_by_current_process=owned,
    )


async def test_managed_provider_returns_page_hmac_and_cleans_session() -> None:
    """确保受管页面只返回 HMAC 且页面与 CDP 会话始终关闭。"""
    challenge = OneTimeAccountChallenge(b"a" * 32, "0" * 32)
    page = _Page(
        {
            "status": "proved",
            "proof": challenge.prove("synthetic-account").hex(),
        }
    )
    session = _Session(page)
    provider = ManagedAccountProofProvider(
        cast(ManagedBrowserController, _Controller(_status())),
        ManagedBrowserExecutionGate(),
        lambda: cast(ManagedPageSession, session),
    )

    proof = await provider.prove_account(challenge)

    assert proof.state is AccountProofState.PROVED
    assert proof.comparison_digest == challenge.prove("synthetic-account")
    assert session.connected_port == 9222
    assert page.goto_calls == ["https://www.xiaohongshu.com/explore/"]
    assert page.proof_payload == {
        "challengeId": "0" * 32,
        "challengeKey": "YWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWE",
    }
    assert page.closed is True
    assert session.closed is True


async def test_managed_provider_rejects_stopped_or_external_browser() -> None:
    """确保未运行或其他进程持有的 Profile 不会连接 CDP。"""
    for status in (
        _status(ManagedBrowserState.STOPPED),
        _status(owned=False),
    ):
        called = False

        def factory() -> ManagedPageSession:
            nonlocal called
            called = True
            raise AssertionError("不应创建 CDP 会话")

        provider = ManagedAccountProofProvider(
            cast(ManagedBrowserController, _Controller(status)),
            ManagedBrowserExecutionGate(),
            factory,
        )

        proof = await provider.prove_account(OneTimeAccountChallenge.generate())

        assert proof.state is AccountProofState.UNVERIFIED
        assert called is False


async def test_managed_provider_waits_for_shared_execution_gate() -> None:
    """确保账号证明不会与受管任务或发布同时操作 Profile。"""
    gate = ManagedBrowserExecutionGate()
    page = _Page({"status": "logged_out"})
    session = _Session(page)
    provider = ManagedAccountProofProvider(
        cast(ManagedBrowserController, _Controller(_status())),
        gate,
        lambda: cast(ManagedPageSession, session),
    )

    async with gate.hold():
        operation = asyncio.create_task(
            provider.prove_account(OneTimeAccountChallenge.generate())
        )
        await asyncio.sleep(0)
        assert session.connected_port is None

    assert (await operation).state is AccountProofState.LOGGED_OUT
