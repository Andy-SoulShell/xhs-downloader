"""浏览器扩展在线状态用例测试。"""

from xhs_adapters.sqlite import SqliteExtensionCredentialRepository
from xhs_core.application import ExtensionCredentialService


async def test_successful_validation_updates_extension_presence(tmp_path) -> None:
    """确保有效轮询会刷新扩展最近心跳，无效令牌不会刷新。

    Args:
        tmp_path: pytest 提供的临时目录。
    """
    repository = SqliteExtensionCredentialRepository(tmp_path.joinpath("state.db"))
    service = ExtensionCredentialService(repository)
    token = await service.register("synthetic-extension")
    registered = (await service.list_presence())[0]

    assert not await service.validate("synthetic-extension", "wrong-token")
    assert (await service.list_presence())[0] == registered

    assert await service.validate("synthetic-extension", token)
    refreshed = (await service.list_presence())[0]
    assert refreshed.last_seen_at >= registered.last_seen_at
