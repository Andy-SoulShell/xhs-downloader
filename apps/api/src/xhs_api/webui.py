"""把生产 WebUI 安全挂载到本机 API。"""

from pathlib import Path, PurePosixPath

from fastapi import FastAPI
from starlette.exceptions import HTTPException
from starlette.staticfiles import StaticFiles
from starlette.types import Scope


class SpaStaticFiles(StaticFiles):
    """提供静态资源，并只为页面导航回退到入口文件。"""

    async def get_response(self, path: str, scope: Scope):
        """读取静态文件或返回 SPA 入口。

        Args:
            path: 相对挂载点的请求路径。
            scope: 当前 ASGI 请求信息。

        Returns:
            静态文件响应或页面入口响应。
        """
        try:
            response = await super().get_response(path, scope)
        except HTTPException as error:
            if error.status_code != 404 or not _is_page_navigation(path, scope):
                raise
            response = await super().get_response("index.html", scope)
            return _with_cache_policy(response, "index.html")
        if response.status_code == 404 and _is_page_navigation(path, scope):
            response = await super().get_response("index.html", scope)
            return _with_cache_policy(response, "index.html")
        return _with_cache_policy(response, path)


def mount_webui(api: FastAPI, directory: Path) -> None:
    """在 ``/ui`` 挂载已构建 WebUI。

    Args:
        api: 需要增加管理界面的 FastAPI 应用。
        directory: 包含 ``index.html`` 的生产构建目录。

    Raises:
        RuntimeError: 构建目录缺失或不完整。
    """
    resolved = directory.expanduser().resolve()
    if not resolved.joinpath("index.html").is_file():
        raise RuntimeError(f"WebUI 构建不完整：{resolved}")
    api.mount(
        "/ui",
        SpaStaticFiles(directory=resolved, html=True),
        name="webui",
    )


def _is_page_navigation(path: str, scope: Scope) -> bool:
    if scope.get("method") not in {None, "GET", "HEAD"}:
        return False
    if PurePosixPath(path).suffix:
        return False
    headers = dict(scope.get("headers", []))
    accept = headers.get(b"accept", b"").decode("latin-1")
    return not accept or "text/html" in accept


def _with_cache_policy(response, path: str):
    if response.status_code >= 400:
        return response
    normalized = PurePosixPath(path.replace("\\", "/").lstrip("/"))
    if normalized.parts[:1] == ("assets",):
        response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    else:
        response.headers["Cache-Control"] = "no-cache"
    return response
