"""集中配置读取、验证与持久化用例。"""

import asyncio
import os
from collections.abc import Awaitable, Callable, Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol

from pydantic import ValidationError
from xhs_adapters.config import AppSettings
from xhs_core.domain import SettingsError

type RuntimeSettingsApplier = Callable[
    [AppSettings, Callable[[], None]],
    Awaitable[None],
]

_HOT_RUNTIME_FIELDS = frozenset(
    {
        "browser_driver",
        "cookie",
        "max_retry",
        "proxy",
        "route_strategy",
        "timeout",
        "user_agent",
    }
)


class SettingsRepository(Protocol):
    """持久化应用配置字段的端口。"""

    def save(self, values: Mapping[str, Any]) -> None:
        """保存一组已经验证的配置。

        Args:
            values: AppSettings 字段名及其新值。
        """
        ...


@dataclass(frozen=True, slots=True)
class SettingsSnapshot:
    """管理后台可用的配置快照。

    Attributes:
        values: 下次启动时将采用的完整配置。
        config_file: 实际写入的 dotenv 文件。
        restart_required: 保存值是否与当前进程配置不同。
        overridden_fields: 被进程环境变量覆盖的字段。
        cookie_configured: 下次启动配置是否包含 Cookie。
        proxy_configured: 下次启动配置是否包含代理。
    """

    values: AppSettings
    config_file: Path
    restart_required: bool
    overridden_fields: tuple[str, ...]
    cookie_configured: bool
    proxy_configured: bool


class SettingsManager:
    """管理当前进程配置与下次启动配置之间的边界。

    HTTP 连接与只读路由相关配置会在当前请求排空后热替换；目录、并发、
    发布等其余配置仍保留到下次启动。调用方应展示 ``restart_required``，
    避免把尚未生效的配置误认为当前运行状态。

    Attributes:
        current: 当前进程正在使用的配置。
        config_file: 下次启动读取的 dotenv 文件。
    """

    def __init__(
        self,
        current: AppSettings,
        config_file: Path,
        repository: SettingsRepository,
        environment: Mapping[str, str] | None = None,
        runtime_overrides: set[str] | None = None,
        apply_runtime: RuntimeSettingsApplier | None = None,
    ) -> None:
        """初始化配置管理器。

        Args:
            current: 当前进程配置。
            config_file: dotenv 文件路径。
            repository: 配置持久化端口。
            environment: 用于识别高优先级覆盖项的进程环境。
            runtime_overrides: CLI 等启动参数显式覆盖的字段。
            apply_runtime: 排空当前请求后替换运行时并通知提交边界的回调。
        """
        self.current = current
        self.config_file = config_file.expanduser().resolve()
        self._repository = repository
        self._environment = environment if environment is not None else os.environ
        self._runtime_overrides = runtime_overrides or set()
        self._apply_runtime = apply_runtime
        self._update_lock = asyncio.Lock()

    async def get(self) -> SettingsSnapshot:
        """读取下次启动的配置快照。

        Returns:
            隐私状态与重启状态完整的配置快照。
        """
        async with self._update_lock:
            values = await asyncio.to_thread(
                AppSettings.from_env,
                self.config_file,
            )
            return self._snapshot(values)

    async def update(self, values: Mapping[str, Any]) -> SettingsSnapshot:
        """验证并写入配置。

        Args:
            values: 需要更新的 AppSettings 字段。

        Returns:
            写入后的下次启动配置快照。

        Raises:
            SettingsError: 字段未知或配置组合未通过验证。
        """
        async with self._update_lock:
            unknown = set(values).difference(AppSettings.model_fields)
            if unknown:
                raise SettingsError(f"未知配置项：{', '.join(sorted(unknown))}")
            pending = await asyncio.to_thread(
                AppSettings.from_env,
                self.config_file,
            )
            candidate_data = pending.model_dump()
            candidate_data.update(values)
            try:
                candidate = AppSettings(**candidate_data)
            except ValidationError as error:
                message = error.errors(include_input=False)[0]["msg"]
                raise SettingsError(f"配置校验失败：{message}") from error
            await asyncio.to_thread(self._repository.save, values)
            await self._apply_hot_settings(candidate)
            return self._snapshot(candidate)

    async def _apply_hot_settings(self, candidate: AppSettings) -> None:
        if self._apply_runtime is None:
            return
        overridden = set(self._overridden_fields())
        current_values = _settings_values(self.current)
        candidate_values = _settings_values(candidate)
        for name in _HOT_RUNTIME_FIELDS.difference(overridden):
            current_values[name] = candidate_values[name]
        effective = AppSettings(**current_values)
        if _settings_fingerprint(effective) == _settings_fingerprint(self.current):
            return
        committed = False

        def commit() -> None:
            nonlocal committed
            self.current = effective
            committed = True

        try:
            await self._apply_runtime(effective, commit)
        except Exception as error:
            message = (
                "配置已生效，但旧运行时释放失败；请重启本地服务完成清理"
                if committed
                else "配置已保存，但运行时热更新失败；请重启本地服务后生效"
            )
            raise SettingsError(message) from error
        if not committed:
            raise SettingsError(
                "配置已保存，但运行时没有提交更新；请重启本地服务后生效"
            )

    def _snapshot(self, values: AppSettings) -> SettingsSnapshot:
        overridden = self._overridden_fields()
        return SettingsSnapshot(
            values=values,
            config_file=self.config_file,
            restart_required=_settings_fingerprint(values, overridden)
            != _settings_fingerprint(self.current, overridden),
            overridden_fields=overridden,
            cookie_configured=bool(values.cookie.get_secret_value()),
            proxy_configured=bool(values.proxy),
        )

    def _overridden_fields(self) -> tuple[str, ...]:
        return tuple(
            name
            for name in AppSettings.model_fields
            if f"XHS_{name.upper()}" in self._environment
            or name in self._runtime_overrides
        )


def _settings_fingerprint(
    settings: AppSettings,
    overridden: tuple[str, ...] = (),
) -> dict[str, Any]:
    """计算用于判断是否需要重启的配置指纹。

    命令行参数与环境变量强制覆盖的字段会在每次启动时重新覆盖，重启
    并不能让文件中的值生效，因此不参与比较；否则桌面模式下自定义端口
    会让界面永远提示需要重启。

    Args:
        settings: 待比较的配置。
        overridden: 由环境变量或运行时参数强制覆盖的字段名。

    Returns:
        排除强制覆盖字段后的可比较配置值。
    """
    values = _settings_values(settings, mode="json")
    for name in overridden:
        values.pop(name, None)
    return values


def _settings_values(
    settings: AppSettings,
    *,
    mode: str = "python",
) -> dict[str, Any]:
    values = settings.model_dump(mode=mode)
    values["cookie"] = settings.cookie.get_secret_value()
    return values
