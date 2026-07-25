"""浏览器只读能力提交前的驱动可用性检查。"""

from datetime import UTC, datetime, timedelta
from typing import Protocol

from xhs_core.domain import (
    BrowserDriver,
    ExtensionPresence,
    ManagedBrowserState,
    ProviderError,
    ProviderFailureCode,
    ProviderKind,
)
from xhs_core.domain.browser_ports import ManagedBrowserController


class _ExtensionPresenceSource(Protocol):
    async def list_presence(self) -> list[ExtensionPresence]:
        """读取已登记扩展的最近在线状态。

        Returns:
            已登记扩展及其最近认证时间。
        """
        ...


class BrowserReadinessProbe(Protocol):
    """浏览器只读 Provider 使用的提交前可用性端口。"""

    async def ensure_available(self, driver: BrowserDriver) -> None:
        """确认指定驱动可以领取新任务。

        Args:
            driver: 调用方明确选择的浏览器执行驱动。

        Raises:
            ProviderError: 驱动未配置或暂时不可用。
        """
        ...


class BrowserReadinessService(BrowserReadinessProbe):
    """检查扩展或受管浏览器是否能及时领取新任务。

    该检查只判断本机执行通道，不读取小红书账号数据。检查通过与任务
    提交之间仍可能发生竞态，因此调用方还必须在等待超时时取消尚未
    运行的任务。

    Args:
        credentials: 扩展登记和最近心跳服务；未配置扩展时可为 ``None``。
        managed: 受管 Chromium 生命周期控制器；未配置时可为 ``None``。
        extension_online_seconds: 扩展最近认证后视为在线的秒数。

    Raises:
        ValueError: 在线判定窗口不大于零。
    """

    def __init__(
        self,
        credentials: _ExtensionPresenceSource | None,
        managed: ManagedBrowserController | None,
        extension_online_seconds: float = 75,
    ) -> None:
        if extension_online_seconds <= 0:
            raise ValueError("扩展在线判定窗口必须大于零")
        self._credentials = credentials
        self._managed = managed
        self._extension_online = timedelta(seconds=extension_online_seconds)

    async def ensure_available(self, driver: BrowserDriver) -> None:
        """确认指定驱动当前可以领取浏览器任务。

        Args:
            driver: 调用方明确选择的浏览器执行驱动。

        Raises:
            ProviderError: 驱动未配置、未运行或状态检查失败。
        """
        if driver is BrowserDriver.EXTENSION:
            await self._ensure_extension()
            return
        await self._ensure_managed()

    async def _ensure_extension(self) -> None:
        if self._credentials is None:
            raise _not_configured("尚未配置浏览器扩展")
        try:
            presence = await self._credentials.list_presence()
        except Exception as error:
            raise _unavailable("无法读取浏览器扩展状态") from error
        if not presence:
            raise _not_configured("尚未登记浏览器扩展")
        now = datetime.now(UTC)
        online = any(
            now - _aware(item.last_seen_at) <= self._extension_online
            for item in presence
        )
        if online:
            return
        raise _unavailable("浏览器扩展当前不在线，请打开或重新加载扩展")

    async def _ensure_managed(self) -> None:
        if self._managed is None:
            raise _not_configured("尚未配置受管浏览器")
        try:
            status = await self._managed.status()
        except Exception as error:
            raise _unavailable("无法读取受管浏览器状态") from error
        if not status.installed:
            raise _not_configured("未检测到可用的 Chromium 浏览器")
        if status.state is not ManagedBrowserState.RUNNING or status.cdp_port is None:
            raise _unavailable("受管浏览器尚未启动")


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=UTC)


def _not_configured(message: str) -> ProviderError:
    return ProviderError(
        ProviderKind.BROWSER,
        ProviderFailureCode.NOT_CONFIGURED,
        message,
    )


def _unavailable(message: str) -> ProviderError:
    return ProviderError(
        ProviderKind.BROWSER,
        ProviderFailureCode.UNAVAILABLE,
        message,
    )
