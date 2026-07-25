"""浏览器驱动提交前可用性检查测试。"""

from datetime import UTC, datetime, timedelta

import pytest
from xhs_core.application import BrowserReadinessService
from xhs_core.domain import (
    BrowserDriver,
    ExtensionPresence,
    ManagedBrowserState,
    ManagedBrowserStatus,
    ProviderError,
    ProviderFailureCode,
)


class _Credentials:
    def __init__(
        self,
        presence: list[ExtensionPresence] | None = None,
        error: Exception | None = None,
    ) -> None:
        self.presence = presence or []
        self.error = error

    async def list_presence(self) -> list[ExtensionPresence]:
        if self.error:
            raise self.error
        return self.presence


class _Controller:
    def __init__(
        self,
        status: ManagedBrowserStatus | None = None,
        error: Exception | None = None,
    ) -> None:
        self.browser_status = status
        self.error = error

    async def status(self) -> ManagedBrowserStatus:
        if self.error:
            raise self.error
        assert self.browser_status is not None
        return self.browser_status


def _presence(seen_at: datetime) -> ExtensionPresence:
    return ExtensionPresence(
        extension_id="synthetic-extension",
        registered_at=seen_at,
        last_seen_at=seen_at,
    )


def _managed_status(
    *,
    installed: bool = True,
    state: ManagedBrowserState = ManagedBrowserState.RUNNING,
) -> ManagedBrowserStatus:
    return ManagedBrowserStatus(
        installed=installed,
        state=state,
        executable_name="synthetic-chromium" if installed else None,
        cdp_port=19222 if state is ManagedBrowserState.RUNNING else None,
        message="合成状态",
    )


@pytest.mark.parametrize(
    ("credentials", "expected_code"),
    [
        (None, ProviderFailureCode.NOT_CONFIGURED),
        (_Credentials(), ProviderFailureCode.NOT_CONFIGURED),
        (
            _Credentials([_presence(datetime.now(UTC) - timedelta(minutes=2))]),
            ProviderFailureCode.UNAVAILABLE,
        ),
        (
            _Credentials(error=RuntimeError("synthetic")),
            ProviderFailureCode.UNAVAILABLE,
        ),
    ],
)
async def test_extension_unavailable_states_are_typed(
    credentials,
    expected_code: ProviderFailureCode,
) -> None:
    """确保未配置、离线和检查失败使用稳定错误分类。

    Args:
        credentials: 合成扩展心跳来源。
        expected_code: 期望的 Provider 失败分类。
    """
    readiness = BrowserReadinessService(credentials, None)

    with pytest.raises(ProviderError) as captured:
        await readiness.ensure_available(BrowserDriver.EXTENSION)

    assert captured.value.code is expected_code


@pytest.mark.parametrize(
    "seen_at",
    [
        datetime.now(UTC),
        datetime.now(UTC).replace(tzinfo=None),
    ],
)
async def test_recent_extension_presence_is_available(seen_at: datetime) -> None:
    """确保近期心跳兼容带时区与旧版无时区时间。

    Args:
        seen_at: 合成扩展最近认证时间。
    """
    readiness = BrowserReadinessService(
        _Credentials([_presence(seen_at)]),
        None,
    )

    await readiness.ensure_available(BrowserDriver.EXTENSION)


@pytest.mark.parametrize(
    ("controller", "expected_code"),
    [
        (None, ProviderFailureCode.NOT_CONFIGURED),
        (
            _Controller(_managed_status(installed=False)),
            ProviderFailureCode.NOT_CONFIGURED,
        ),
        (
            _Controller(_managed_status(state=ManagedBrowserState.STOPPED)),
            ProviderFailureCode.UNAVAILABLE,
        ),
        (
            _Controller(error=RuntimeError("synthetic")),
            ProviderFailureCode.UNAVAILABLE,
        ),
    ],
)
async def test_managed_browser_unavailable_states_are_typed(
    controller,
    expected_code: ProviderFailureCode,
) -> None:
    """确保未安装、未启动和检查失败使用稳定错误分类。

    Args:
        controller: 合成受管浏览器控制器。
        expected_code: 期望的 Provider 失败分类。
    """
    readiness = BrowserReadinessService(None, controller)

    with pytest.raises(ProviderError) as captured:
        await readiness.ensure_available(BrowserDriver.MANAGED)

    assert captured.value.code is expected_code


async def test_running_managed_browser_is_available() -> None:
    """确保带有效本机 CDP 端口的运行态受管浏览器通过检查。"""
    readiness = BrowserReadinessService(
        None,
        _Controller(_managed_status()),
    )

    await readiness.ensure_available(BrowserDriver.MANAGED)


def test_readiness_rejects_non_positive_online_window() -> None:
    """确保扩展在线窗口必须为正数。"""
    with pytest.raises(ValueError, match="必须大于零"):
        BrowserReadinessService(None, None, extension_online_seconds=0)
