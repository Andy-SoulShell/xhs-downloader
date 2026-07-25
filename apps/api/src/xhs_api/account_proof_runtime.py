"""统一读取运行时的扩展账号证明适配器。"""

from datetime import UTC, datetime, timedelta

from xhs_core.application import (
    ExtensionAccountChallengeChannel,
    ExtensionCredentialService,
)
from xhs_core.domain import AccountProof, OneTimeAccountChallenge

_ONLINE_GRACE = timedelta(seconds=75)


class ExtensionAccountProofProvider:
    """通过唯一在线扩展生成一次性账号证明。

    多个扩展同时在线时无法保证证明页面与后续任务执行页面属于同一
    Profile，因此当前普通用户版本会安全拒绝，而不是任选一个扩展。

    Args:
        channel: 不经过 SQLite 的短期内存挑战通道。
        credentials: 提供扩展最近认证时间的凭据服务。
    """

    def __init__(
        self,
        channel: ExtensionAccountChallengeChannel,
        credentials: ExtensionCredentialService,
    ) -> None:
        self._channel = channel
        self._credentials = credentials

    async def prove_account(
        self,
        challenge: OneTimeAccountChallenge,
    ) -> AccountProof:
        """请求唯一在线扩展对当前页面账号生成 HMAC。

        Args:
            challenge: 当前路由门禁创建的一次性挑战。

        Returns:
            扩展返回的脱敏证明；在线扩展数量不是一时无法确认。
        """
        now = datetime.now(UTC)
        online = [
            presence
            for presence in await self._credentials.list_presence()
            if now - presence.last_seen_at <= _ONLINE_GRACE
        ]
        if len(online) != 1:
            return AccountProof.unverified()
        return await self._channel.request(
            challenge,
            online[0].extension_id,
        )
