"""仅限本机使用的配置管理 API。"""

from collections.abc import Callable
from ipaddress import ip_address
from urllib.parse import urlsplit

from fastapi import APIRouter, HTTPException, Request
from pydantic import SecretStr

from src.application import SettingsManager, SettingsSnapshot

from .api_models import SettingsResponse, SettingsUpdate, SettingsValues

SettingsAccessPolicy = Callable[[Request], bool]


def allow_loopback_settings(request: Request) -> bool:
    """判断配置请求是否来自本机回环地址。

    Args:
        request: 当前 HTTP 请求。

    Returns:
        客户端地址属于 IPv4 或 IPv6 回环网段时返回真。
    """
    if not request.client:
        return False
    if not _is_loopback_host(request.client.host):
        return False
    origin = request.headers.get("origin")
    if not origin:
        return True
    parsed = urlsplit(origin)
    return parsed.scheme in {"http", "https"} and _is_loopback_host(
        parsed.hostname or ""
    )


def create_settings_router(
    manager: SettingsManager,
    access_policy: SettingsAccessPolicy = allow_loopback_settings,
) -> APIRouter:
    """创建配置管理路由。

    Args:
        manager: 配置读取与持久化用例。
        access_policy: 本机访问判定策略。

    Returns:
        注册配置查询与更新端点的路由。
    """
    router = APIRouter(prefix="/settings", tags=["配置"])

    @router.get("", response_model=SettingsResponse)
    async def get_settings(request: Request) -> SettingsResponse:
        _require_access(request, access_policy)
        return _settings_response(await manager.get())

    @router.put("", response_model=SettingsResponse)
    async def update_settings(
        payload: SettingsUpdate,
        request: Request,
    ) -> SettingsResponse:
        _require_access(request, access_policy)
        values = payload.model_dump(exclude_unset=True)
        for name in ("cookie", "proxy"):
            secret = values.get(name)
            if isinstance(secret, SecretStr):
                values[name] = secret.get_secret_value()
        return _settings_response(await manager.update(values))

    return router


def _require_access(
    request: Request,
    access_policy: SettingsAccessPolicy,
) -> None:
    if not access_policy(request):
        raise HTTPException(
            status_code=403,
            detail="配置管理仅允许从本机访问",
        )


def _is_loopback_host(host: str) -> bool:
    if host.casefold() == "localhost":
        return True
    try:
        return ip_address(host).is_loopback
    except ValueError:
        return False


def _settings_response(snapshot: SettingsSnapshot) -> SettingsResponse:
    settings = snapshot.values
    values = settings.model_dump(
        mode="json",
        exclude={"cookie", "proxy"},
    )
    values["work_path"] = str(settings.work_path) if settings.work_path else None
    return SettingsResponse(
        values=SettingsValues.model_validate(values),
        config_file=str(snapshot.config_file),
        restart_required=snapshot.restart_required,
        overridden_fields=list(snapshot.overridden_fields),
        cookie_configured=snapshot.cookie_configured,
        proxy_configured=snapshot.proxy_configured,
    )
