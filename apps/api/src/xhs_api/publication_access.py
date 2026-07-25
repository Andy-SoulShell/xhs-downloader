"""内容发布接口的本机与扩展访问边界。"""

from ipaddress import ip_address
from urllib.parse import urlsplit

from fastapi import HTTPException, Request
from xhs_core.application import ExtensionCredentialService

from .settings import SettingsAccessPolicy

_EXTENSION_SCHEMES = {
    "chrome-extension",
    "moz-extension",
    "safari-web-extension",
}


def require_management(
    request: Request,
    access_policy: SettingsAccessPolicy,
) -> None:
    """限制发布管理请求只能来自本机。

    Args:
        request: 当前 HTTP 请求。
        access_policy: 本机管理访问策略。

    Raises:
        HTTPException: 请求不符合本机管理边界。
    """
    if not access_policy(request):
        raise HTTPException(status_code=403, detail="发布管理仅允许从本机访问")


def require_extension_origin(request: Request, extension_id: str) -> None:
    """核对扩展登记来源与扩展标识。

    Args:
        request: 当前 HTTP 请求。
        extension_id: 扩展声明的实例标识。

    Raises:
        HTTPException: 请求不是本机连接或来源不匹配。
    """
    if not request.client or not _is_loopback(request.client.host):
        raise HTTPException(status_code=403, detail="扩展登记仅允许连接本机服务")
    origin = urlsplit(request.headers.get("origin", ""))
    if origin.scheme not in _EXTENSION_SCHEMES or origin.netloc != extension_id:
        raise HTTPException(status_code=403, detail="扩展来源与标识不匹配")


async def require_extension(
    request: Request,
    credentials: ExtensionCredentialService,
) -> str:
    """验证扩展能力令牌。

    Args:
        request: 当前 HTTP 请求。
        credentials: 扩展能力凭据服务。

    Returns:
        已认证扩展标识。

    Raises:
        HTTPException: 能力令牌无效。
    """
    extension_id = request.headers.get("x-extension-id", "")
    authorization = request.headers.get("authorization", "")
    scheme, _, token = authorization.partition(" ")
    if (
        not extension_id
        or scheme.casefold() != "bearer"
        or not token
        or not await credentials.validate(extension_id, token)
    ):
        raise HTTPException(status_code=401, detail="扩展能力令牌无效")
    return extension_id


def require_lease_token(request: Request) -> str:
    """读取发布任务短期租约。

    Args:
        request: 当前 HTTP 请求。

    Returns:
        请求携带的租约令牌。

    Raises:
        HTTPException: 请求没有携带租约。
    """
    token = request.headers.get("x-publish-lease", "")
    if not token:
        raise HTTPException(status_code=401, detail="缺少发布任务租约")
    return token


def _is_loopback(host: str) -> bool:
    if host.casefold() == "localhost":
        return True
    try:
        return ip_address(host).is_loopback
    except ValueError:
        return False
