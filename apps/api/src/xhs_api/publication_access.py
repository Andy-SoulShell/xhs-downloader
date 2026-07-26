"""内容发布接口的本机管理与租约边界。"""

from fastapi import HTTPException, Request

from .settings import SettingsAccessPolicy


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
