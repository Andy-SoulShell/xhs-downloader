"""受管 Chromium 当前账号的一次性内存证明。"""

from base64 import urlsafe_b64encode
from contextlib import suppress
from typing import Any

from xhs_core.application import ManagedBrowserExecutionGate
from xhs_core.domain import (
    AccountProof,
    ManagedBrowserState,
    OneTimeAccountChallenge,
)
from xhs_core.domain.browser_ports import ManagedBrowserController

from .managed_page_assets import load_managed_page_adapter
from .managed_page_session import (
    ManagedPage,
    ManagedPageSessionFactory,
    PlaywrightCdpSession,
)
from .managed_task_navigation import EXPLORE_URL

_ADAPTER_GLOBAL = "__XHS_DOWNLOADER_MANAGED_PAGE_ADAPTER__"
_PROOF_EXPRESSION = f"(challenge) => window.{_ADAPTER_GLOBAL}.proveAccount(challenge)"
_PAGE_NAVIGATION_TIMEOUT_MILLISECONDS = 30_000


class ManagedAccountProofProvider:
    """通过当前进程持有的受管 Profile 生成一次性账号证明。

    整个 CDP 会话复用受管任务和发布的独占闸门。该 Provider 不会自动
    启动 Chromium，也不会把账号标识、密钥或证明写入浏览器任务仓储。

    Args:
        controller: 当前进程的受管 Chromium 控制器。
        execution_gate: 与受管任务和发布共享的独占执行闸门。
        session_factory: 创建短生命周期 CDP 会话的工厂。
    """

    def __init__(
        self,
        controller: ManagedBrowserController,
        execution_gate: ManagedBrowserExecutionGate,
        session_factory: ManagedPageSessionFactory = PlaywrightCdpSession,
    ) -> None:
        self._controller = controller
        self._execution_gate = execution_gate
        self._session_factory = session_factory

    async def prove_account(
        self,
        challenge: OneTimeAccountChallenge,
    ) -> AccountProof:
        """在新建探索页中计算 HMAC 并立即销毁页面会话。

        Args:
            challenge: 当前路由门禁创建的一次性挑战。

        Returns:
            页面生成的脱敏证明；浏览器不可用或页面不兼容时无法确认。
        """
        async with self._execution_gate.hold():
            status = await self._controller.status()
            if (
                status.state is not ManagedBrowserState.RUNNING
                or not status.owned_by_current_process
                or status.cdp_port is None
            ):
                return AccountProof.unverified()
            session = self._session_factory()
            page: ManagedPage | None = None
            try:
                await session.connect(status.cdp_port)
                page = await session.new_page()
                await page.goto(
                    EXPLORE_URL,
                    wait_until="domcontentloaded",
                    timeout=_PAGE_NAVIGATION_TIMEOUT_MILLISECONDS,
                )
                await page.evaluate(load_managed_page_adapter())
                response = await page.evaluate(
                    _PROOF_EXPRESSION,
                    {
                        "challengeId": challenge.challenge_id,
                        "challengeKey": _base64url(challenge.export_ephemeral_key()),
                    },
                )
                return _parse_response(response)
            except Exception:
                return AccountProof.unverified()
            finally:
                if page is not None:
                    with suppress(Exception):
                        await page.close()
                with suppress(Exception):
                    await session.close()


def _parse_response(value: Any) -> AccountProof:
    if not isinstance(value, dict):
        return AccountProof.unverified()
    status = value.get("status")
    if status == "logged_out":
        return AccountProof.logged_out()
    if status != "proved":
        return AccountProof.unverified()
    proof = value.get("proof")
    if not isinstance(proof, str) or len(proof) != 64:
        return AccountProof.unverified()
    try:
        return AccountProof.proved(bytes.fromhex(proof))
    except ValueError:
        return AccountProof.unverified()


def _base64url(value: bytes) -> str:
    return urlsafe_b64encode(value).decode("ascii").rstrip("=")
