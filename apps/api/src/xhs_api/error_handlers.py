"""API 层的领域异常到 HTTP 响应映射。"""

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from xhs_core.domain import (
    AccountConsistencyError,
    BrowserTaskLeaseConflictError,
    ProviderError,
    XhsError,
)


def register_exception_handlers(api: FastAPI) -> None:
    """把领域异常注册为统一的 HTTP 响应。

    Args:
        api: 待注册处理器的应用实例。
    """
    @api.exception_handler(ProviderError)
    async def handle_provider_error(
        _: Request,
        error: ProviderError,
    ) -> JSONResponse:
        return JSONResponse(
            status_code=400,
            content={
                "message": error.message,
                "provider": error.provider.value,
                "code": error.code.value,
            },
        )

    @api.exception_handler(BrowserTaskLeaseConflictError)
    async def handle_browser_lease_conflict(
        _: Request,
        error: BrowserTaskLeaseConflictError,
    ) -> JSONResponse:
        """将浏览器执行器的陈旧租约映射为 HTTP 冲突。

        Args:
            _: 当前 HTTP 请求。
            error: 已确认的租约或状态快照冲突。

        Returns:
            不包含租约令牌的冲突响应。
        """
        return JSONResponse(status_code=409, content={"message": str(error)})

    @api.exception_handler(AccountConsistencyError)
    async def handle_account_consistency_error(
        _: Request,
        error: AccountConsistencyError,
    ) -> JSONResponse:
        """返回不含账号和证明材料的固定路由阻止结果。

        Args:
            _: 当前 HTTP 请求。
            error: 账号一致性门禁的脱敏结论。

        Returns:
            供 WebUI 与 MCP 稳定识别的冲突响应。
        """
        return JSONResponse(
            status_code=409,
            content={
                "code": "account_consistency_failed",
                "account_consistency": error.status.value,
                "message": str(error),
            },
        )

    @api.exception_handler(XhsError)
    async def handle_xhs_error(_: Request, error: XhsError) -> JSONResponse:
        return JSONResponse(status_code=400, content={"message": str(error)})
