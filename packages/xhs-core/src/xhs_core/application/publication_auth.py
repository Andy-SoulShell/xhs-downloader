"""浏览器扩展发布能力凭据用例。"""

from datetime import UTC, datetime
from hashlib import sha256
from secrets import token_urlsafe

from xhs_core.domain import ExtensionPresence
from xhs_core.domain.publication_ports import ExtensionCredentialRepository


class ExtensionCredentialService:
    """签发和校验不含账号信息的本机扩展能力令牌。

    Args:
        repository: 扩展凭据仓储。
    """

    def __init__(self, repository: ExtensionCredentialRepository) -> None:
        self._repository = repository

    async def register(self, extension_id: str) -> str:
        """为扩展签发新的能力令牌。

        Args:
            extension_id: 浏览器分配的扩展 ID。

        Returns:
            只在本次响应中返回的随机令牌。
        """
        token = token_urlsafe(32)
        now = datetime.now(UTC)
        await self._repository.register_extension(
            extension_id,
            _token_hash(token),
            now,
        )
        return token

    async def validate(self, extension_id: str, token: str) -> bool:
        """校验扩展能力令牌。

        Args:
            extension_id: 浏览器分配的扩展 ID。
            token: 扩展保存的本机能力令牌。

        Returns:
            令牌有效时返回真。
        """
        valid = await self._repository.validate_extension(
            extension_id,
            _token_hash(token),
        )
        if valid:
            await self._repository.touch_extension(
                extension_id,
                datetime.now(UTC),
            )
        return valid

    async def list_presence(self) -> list[ExtensionPresence]:
        """列出扩展登记与最近认证时间。

        Returns:
            按最近认证时间倒序排列的扩展状态。
        """
        return await self._repository.list_extensions()


def _token_hash(token: str) -> str:
    return sha256(token.encode("utf-8")).hexdigest()
