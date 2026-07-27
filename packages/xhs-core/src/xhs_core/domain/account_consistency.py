"""跨提供方账号一致性使用的领域类型。"""

import hmac
import secrets
from dataclasses import dataclass, field
from enum import StrEnum
from typing import Protocol

from .capability_routing import RoutePolicyError

_CHALLENGE_SIZE = 32
_CHALLENGE_ID_SIZE = 32
_PROOF_SIZE = 32
_PROOF_CONTEXT = b"xhs-account-challenge/v1\0"


class ReadAccountScope(StrEnum):
    """只读能力对登录账号的依赖范围。"""

    PUBLIC = "public"
    ACCOUNT_SCOPED = "account_scoped"


class AccountProofState(StrEnum):
    """单个提供方生成账号证明时的稳定状态。"""

    PROVED = "proved"
    LOGGED_OUT = "logged_out"
    UNVERIFIED = "unverified"


class AccountConsistencyStatus(StrEnum):
    """两个提供方的一次性账号比较结论。"""

    MATCHED = "matched"
    DIFFERENT = "different"
    LOGGED_OUT = "logged_out"
    UNVERIFIED = "unverified"


class OneTimeAccountChallenge:
    """只存在于一次比较过程中的随机账号挑战。

    挑战禁止通过 Pickle 或复制协议序列化。适配器只能通过明确命名的
    :meth:`export_ephemeral_key` 把密钥临时送入浏览器隔离执行环境；
    密钥不得写入模型、日志、诊断、浏览器存储或持久化任务。

    Args:
        secret: 恰好 32 字节的一次性随机密钥。
        challenge_id: 可选的 32 位小写十六进制挑战标识。
    """

    __slots__ = ("__secret", "_challenge_id")

    def __init__(
        self,
        secret: bytes,
        challenge_id: str | None = None,
    ) -> None:
        if len(secret) != _CHALLENGE_SIZE:
            raise ValueError("一次性账号挑战必须使用 32 字节密钥")
        resolved_id = challenge_id or secrets.token_hex(_CHALLENGE_ID_SIZE // 2)
        if len(resolved_id) != _CHALLENGE_ID_SIZE or any(
            character not in "0123456789abcdef" for character in resolved_id
        ):
            raise ValueError("一次性账号挑战标识必须是 32 位小写十六进制文本")
        self.__secret = bytes(secret)
        self._challenge_id = resolved_id

    @classmethod
    def generate(cls) -> "OneTimeAccountChallenge":
        """生成密码学安全的一次性挑战。

        Returns:
            使用全新随机密钥的挑战。
        """
        return cls(secrets.token_bytes(_CHALLENGE_SIZE))

    def prove(self, account_identity: str) -> bytes:
        """为当前提供方的稳定账号标识生成一次性证明。

        Args:
            account_identity: 提供方内部取得的非空稳定账号标识。

        Returns:
            仅对本次挑战有效的 SHA-256 HMAC 摘要。

        Raises:
            ValueError: 账号标识为空。
        """
        if not account_identity:
            raise ValueError("账号标识不能为空")
        return hmac.digest(
            self.__secret,
            self._proof_message(account_identity),
            "sha256",
        )

    @property
    def challenge_id(self) -> str:
        """取得不含账号信息的本轮随机标识。

        Returns:
            仅用于本轮证明协议的 32 位小写十六进制文本。
        """
        return self._challenge_id

    def export_ephemeral_key(self) -> bytes:
        """为浏览器隔离执行环境导出本轮临时密钥。

        返回值只允许存在于一次证明调用的局部变量中，不得缓存、记录、
        诊断或持久化。公开该方法是为了让浏览器直接返回 HMAC 摘要，
        避免把稳定账号标识带回服务端适配器。

        Returns:
            本轮挑战的 32 字节临时密钥副本。
        """
        return bytes(self.__secret)

    def _proof_message(self, account_identity: str) -> bytes:
        return (
            _PROOF_CONTEXT
            + self._challenge_id.encode("ascii")
            + b"\0"
            + account_identity.encode("utf-8")
        )

    def __repr__(self) -> str:
        """返回不会泄露随机密钥的调试文本。"""
        return "OneTimeAccountChallenge(<已隐藏>)"

    def __reduce_ex__(self, protocol: int) -> object:
        """拒绝 Pickle 和复制协议读取挑战密钥。

        Args:
            protocol: 调用方请求使用的 Pickle 协议版本。

        Raises:
            TypeError: 挑战在任何协议下都禁止序列化。
        """
        del protocol
        raise TypeError("一次性账号挑战禁止序列化")


@dataclass(frozen=True, slots=True)
class AccountProof:
    """单个提供方对一次性挑战的证明结果。

    Attributes:
        state: 提供方生成证明时的稳定状态。
    """

    state: AccountProofState
    _digest: bytes | None = field(default=None, repr=False)

    def __post_init__(self) -> None:
        """校验证明状态与摘要是否匹配。

        Raises:
            ValueError: 已证明状态缺少有效摘要，或其他状态携带摘要。
        """
        if self.state is AccountProofState.PROVED:
            if self._digest is None or len(self._digest) != _PROOF_SIZE:
                raise ValueError("已证明状态必须携带 32 字节摘要")
            object.__setattr__(self, "_digest", bytes(self._digest))
            return
        if self._digest is not None:
            raise ValueError("未证明状态禁止携带账号摘要")

    @classmethod
    def proved(cls, digest: bytes) -> "AccountProof":
        """构造已生成摘要的证明。

        Args:
            digest: 一次性挑战生成的 32 字节摘要。

        Returns:
            已证明状态。
        """
        return cls(AccountProofState.PROVED, digest)

    @classmethod
    def logged_out(cls) -> "AccountProof":
        """构造提供方明确未登录的证明。

        Returns:
            未携带摘要的未登录状态。
        """
        return cls(AccountProofState.LOGGED_OUT)

    @classmethod
    def unverified(cls) -> "AccountProof":
        """构造提供方无法确认账号的证明。

        Returns:
            未携带摘要的无法确认状态。
        """
        return cls(AccountProofState.UNVERIFIED)

    @property
    def comparison_digest(self) -> bytes | None:
        """取得仅供进程内恒定时间比较的摘要。

        Returns:
            已证明状态的摘要；其他状态返回 ``None``。
        """
        return self._digest


class AccountProofProvider(Protocol):
    """为当前会话生成一次性账号证明的提供方端口。"""

    async def prove_account(
        self,
        challenge: OneTimeAccountChallenge,
    ) -> AccountProof:
        """生成当前会话的账号证明。

        Args:
            challenge: 仅对本次比较有效的随机挑战。

        Returns:
            不包含稳定账号标识的证明状态。
        """
        ...


class AccountConsistencyGuard(Protocol):
    """路由器在跨提供方回退前调用的一致性门禁端口。"""

    async def verify(self) -> AccountConsistencyStatus:
        """比较参与路由的两个提供方账号。

        Returns:
            不包含证明摘要和稳定账号标识的比较结论。
        """
        ...


_BLOCKED_MESSAGES = {
    AccountConsistencyStatus.DIFFERENT: (
        "保存的 Cookie 和浏览器里登录的不是同一个账号，为免串号已经停下"
    ),
    AccountConsistencyStatus.LOGGED_OUT: (
        "还没有登录小红书，先完成登录再试"
    ),
    AccountConsistencyStatus.UNVERIFIED: (
        "没法确认现在用的是哪个账号，为免串号已经停下，先登录一次再试"
    ),
}


class AccountConsistencyError(RoutePolicyError):
    """账号结论不允许受保护能力跨提供方回退。

    Attributes:
        status: 不包含账号标识或证明摘要的阻止结论。
    """

    def __init__(self, status: AccountConsistencyStatus) -> None:
        try:
            message = _BLOCKED_MESSAGES[status]
        except KeyError as error:
            raise ValueError("matched 结论不能构造账号一致性错误") from error
        self.status = status
        super().__init__(message)
