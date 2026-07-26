"""浏览器扩展协作接口的统一访问边界。"""

from ipaddress import ip_address
from urllib.parse import urlsplit

from fastapi import HTTPException, Request
from xhs_core.application import ExtensionCredentialService

_EXTENSION_SCHEMES = {
    "chrome-extension",
    "moz-extension",
    "safari-web-extension",
}


def require_extension_origin(request: Request, extension_id: str) -> None:
    """核对扩展登记来源与扩展标识。

    Args:
        request: 当前 HTTP 请求。
        extension_id: 扩展声明的实例标识。

    Raises:
        HTTPException: 请求不是本机连接或来源不匹配。
    """
    _require_loopback_client(request, "扩展登记仅允许连接本机服务")
    origin = urlsplit(request.headers.get("origin", ""))
    if origin.scheme not in _EXTENSION_SCHEMES or origin.netloc != extension_id:
        raise HTTPException(status_code=403, detail="扩展来源与标识不匹配")


async def require_extension(
    request: Request,
    credentials: ExtensionCredentialService,
) -> str:
    """验证扩展能力令牌并限制为本机连接。

    扩展的宿主权限只允许访问回环地址，正常调用必然来自本机；令牌接口
    同样拒绝其他来源，避免令牌泄露后被局域网内的其他主机直接使用。

    Args:
        request: 当前 HTTP 请求。
        credentials: 扩展能力凭据服务。

    Returns:
        已认证扩展标识。

    Raises:
        HTTPException: 请求不是本机连接或能力令牌无效。
    """
    _require_loopback_client(request, "扩展接口仅允许连接本机服务")
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


def _require_loopback_client(request: Request, detail: str) -> None:
    if not request.client or not _is_loopback(request.client.host):
        raise HTTPException(status_code=403, detail=detail)


def _is_loopback(host: str) -> bool:
    if host.casefold() == "localhost":
        return True
    try:
        return ip_address(host).is_loopback
    except ValueError:
        return False
