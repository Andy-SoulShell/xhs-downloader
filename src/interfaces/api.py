"""FastAPI 接口。"""

from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field
from uvicorn import Config, Server

from src.application import DownloadService, create_service
from src.config import AppSettings
from src.domain import DownloadArtifact, XhsError
from src.logging import configure_logging
from src.version import VERSION

ServiceFactory = Callable[[AppSettings], DownloadService]


class DetailRequest(BaseModel):
    """作品详情与下载请求。"""

    model_config = ConfigDict(extra="forbid")

    url: str = Field(description="小红书作品链接")
    download: bool = Field(default=False, description="是否下载媒体文件")
    index: list[int] | None = Field(default=None, description="指定图片序号")
    cookie: str | None = Field(
        default=None,
        description="仅用于本次请求的 Cookie",
        repr=False,
    )
    force: bool = Field(default=False, description="是否强制重新下载")


class DetailResponse(BaseModel):
    """作品详情与下载响应。"""

    model_config = ConfigDict(extra="forbid")

    message: str
    data: dict | None = None
    files: list[DownloadArtifact] = Field(default_factory=list)
    skipped: bool = False


def create_api(
    settings: AppSettings | None = None,
    service_factory: ServiceFactory = create_service,
) -> FastAPI:
    """创建具备完整生命周期的 FastAPI 应用。

    Args:
        settings: 应用配置；为空时读取默认环境配置。
        service_factory: 用于测试替换基础设施的服务工厂。

    Returns:
        可交给 ASGI 服务器运行的应用。
    """
    resolved_settings = settings or AppSettings.from_env()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        async with service_factory(resolved_settings) as service:
            app.state.service = service
            yield

    api = FastAPI(
        title="xhs-downloader",
        summary="小红书作品信息解析与媒体下载服务",
        version=VERSION,
        lifespan=lifespan,
    )

    @api.exception_handler(XhsError)
    async def handle_xhs_error(_: Request, error: XhsError) -> JSONResponse:
        return JSONResponse(status_code=400, content={"message": str(error)})

    @api.get("/", tags=["服务"])
    async def service_info() -> dict[str, str]:
        return {
            "name": "xhs-downloader",
            "version": VERSION,
            "docs": "/docs",
        }

    @api.get("/health", tags=["服务"])
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    @api.post("/xhs/detail", response_model=DetailResponse, tags=["作品"])
    async def detail(payload: DetailRequest, request: Request) -> DetailResponse:
        service: DownloadService = request.app.state.service
        if payload.download:
            outcome = await service.download(
                payload.url,
                set(payload.index or []),
                payload.force,
                payload.cookie,
            )
            return DetailResponse(
                message=outcome.message,
                data=outcome.detail.public_dict(),
                files=outcome.artifacts,
                skipped=outcome.skipped,
            )
        work = await service.get_detail(payload.url, payload.cookie)
        return DetailResponse(message="作品信息解析完成", data=work.public_dict())

    return api


async def run_api(settings: AppSettings) -> None:
    """启动 HTTP API 服务。

    Args:
        settings: 服务器与下载配置。
    """
    configure_logging(settings.log_level)
    server = Server(
        Config(
            create_api(settings),
            host=settings.server_host,
            port=settings.server_port,
            log_level=settings.log_level,
            log_config=None,
        )
    )
    await server.serve()
