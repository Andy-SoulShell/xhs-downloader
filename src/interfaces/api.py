"""FastAPI 接口。"""

from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager

from fastapi import FastAPI, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field
from uvicorn import Config, Server

from src.application import DownloadService, create_service
from src.config import AppSettings
from src.domain import ClientDownloadRecord, DownloadArtifact, DownloadMode, XhsError
from src.infrastructure import SqliteClientRecordRepository
from src.logging import configure_logging
from src.version import VERSION

ServiceFactory = Callable[[AppSettings], DownloadService]
EXTENSION_ORIGIN_PATTERN = (
    r"^(chrome-extension|moz-extension|safari-web-extension)://"
    r"[A-Za-z0-9._-]+$"
)


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


class ExtensionCapabilities(BaseModel):
    """浏览器扩展可依赖的服务能力。"""

    model_config = ConfigDict(extra="forbid")

    protocol_version: int = 1
    service_version: str
    download_modes: list[DownloadMode]
    features: dict[str, bool]


class ClientRecordBatch(BaseModel):
    """浏览器扩展同步的一批下载记录。"""

    model_config = ConfigDict(extra="forbid")

    records: list[ClientDownloadRecord] = Field(max_length=200)


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
    client_records = SqliteClientRecordRepository(
        resolved_settings.state_dir.joinpath("downloads.db")
    )

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
    api.add_middleware(
        CORSMiddleware,
        allow_origin_regex=EXTENSION_ORIGIN_PATTERN,
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Content-Type"],
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

    @api.get(
        "/extension/capabilities",
        response_model=ExtensionCapabilities,
        tags=["浏览器扩展"],
    )
    async def extension_capabilities() -> ExtensionCapabilities:
        return ExtensionCapabilities(
            service_version=VERSION,
            download_modes=[DownloadMode.BROWSER, DownloadMode.BACKGROUND],
            features={
                "background_download": True,
                "client_record_sync": True,
                "content_cache": True,
                "artifact_validation": True,
                "partial_resume": True,
                "retry": True,
            },
        )

    @api.post("/extension/records", tags=["浏览器扩展"])
    async def save_client_records(payload: ClientRecordBatch) -> dict[str, int]:
        accepted = await client_records.save_many(payload.records)
        return {"accepted": accepted}

    @api.get(
        "/extension/records",
        response_model=list[ClientDownloadRecord],
        tags=["浏览器扩展"],
    )
    async def list_client_records(
        limit: int = Query(default=100, ge=1, le=500),
    ) -> list[ClientDownloadRecord]:
        return await client_records.list_recent(limit)

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
