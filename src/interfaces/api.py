"""FastAPI 接口。"""

from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from uvicorn import Config, Server

from src.application import (
    DownloadService,
    DownloadTaskCoordinator,
    SettingsManager,
    create_publication_runtime,
    create_service,
)
from src.config import AppSettings
from src.domain import (
    ClientDownloadRecord,
    DownloadMode,
    DownloadTask,
    DownloadTaskStatus,
    XhsError,
)
from src.infrastructure import (
    DotenvSettingsRepository,
    SqliteClientRecordRepository,
    SqliteTaskRepository,
)
from src.logging import configure_logging
from src.version import VERSION

from .api_models import (
    ClientRecordBatch,
    DetailRequest,
    DetailResponse,
    ExtensionCapabilities,
    TaskRequest,
)
from .publication_api import create_publication_router
from .settings_api import (
    SettingsAccessPolicy,
    allow_loopback_settings,
    create_settings_router,
)

ServiceFactory = Callable[[AppSettings], DownloadService]
EXTENSION_ORIGIN_PATTERN = (
    r"^(chrome-extension|moz-extension|safari-web-extension)://"
    r"[A-Za-z0-9._-]+$"
)


def create_api(
    settings: AppSettings | None = None,
    service_factory: ServiceFactory = create_service,
    settings_file: Path | None = None,
    settings_access_policy: SettingsAccessPolicy = allow_loopback_settings,
    settings_override_fields: set[str] | None = None,
) -> FastAPI:
    """创建具备完整生命周期的 FastAPI 应用。

    Args:
        settings: 应用配置；为空时读取默认环境配置。
        service_factory: 用于测试替换基础设施的服务工厂。
        settings_file: 管理后台维护的 dotenv 文件。
        settings_access_policy: 配置端点的本机访问判定策略。
        settings_override_fields: 启动参数覆盖的配置字段。

    Returns:
        可交给 ASGI 服务器运行的应用。
    """
    resolved_settings = settings or AppSettings.from_env()
    resolved_settings_file = settings_file or Path(".env")
    client_records = SqliteClientRecordRepository(
        resolved_settings.state_dir.joinpath("downloads.db")
    )
    task_repository = SqliteTaskRepository(
        resolved_settings.state_dir.joinpath("downloads.db")
    )
    settings_manager = SettingsManager(
        resolved_settings,
        resolved_settings_file,
        DotenvSettingsRepository(resolved_settings_file),
        runtime_overrides=settings_override_fields,
    )
    publication = create_publication_runtime(resolved_settings)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        async with service_factory(resolved_settings) as service:
            tasks = DownloadTaskCoordinator(
                service,
                task_repository,
                resolved_settings.max_concurrency,
            )
            app.state.service = service
            app.state.tasks = tasks
            await tasks.start()
            await publication.scheduler.start()
            try:
                yield
            finally:
                await publication.scheduler.close()
                await tasks.close()

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
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=[
            "Authorization",
            "Content-Type",
            "Range",
            "X-Extension-Id",
            "X-Publish-Lease",
        ],
        expose_headers=[
            "Accept-Ranges",
            "Content-Length",
            "Content-Range",
        ],
    )
    api.include_router(create_settings_router(settings_manager, settings_access_policy))
    api.include_router(
        create_publication_router(
            publication.drafts,
            publication.tasks,
            publication.execution,
            publication.credentials,
            settings_access_policy,
        )
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
            protocol_version=2,
            service_version=VERSION,
            download_modes=[DownloadMode.BROWSER, DownloadMode.BACKGROUND],
            features={
                "background_download": True,
                "client_record_sync": True,
                "content_cache": True,
                "artifact_validation": True,
                "partial_resume": True,
                "persistent_tasks": True,
                "retry": True,
                "publication": True,
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

    @api.post(
        "/tasks",
        response_model=DownloadTask,
        status_code=202,
        tags=["下载任务"],
    )
    async def submit_task(payload: TaskRequest, request: Request) -> DownloadTask:
        tasks: DownloadTaskCoordinator = request.app.state.tasks
        return await tasks.submit(
            payload.url,
            payload.index,
            payload.force,
            payload.request_id,
        )

    @api.get(
        "/tasks",
        response_model=list[DownloadTask],
        tags=["下载任务"],
    )
    async def list_tasks(
        request: Request,
        limit: int = Query(default=100, ge=1, le=500),
        status: Annotated[DownloadTaskStatus | None, Query()] = None,
    ) -> list[DownloadTask]:
        tasks: DownloadTaskCoordinator = request.app.state.tasks
        return await tasks.list_recent(limit, status)

    @api.get(
        "/tasks/{task_id}",
        response_model=DownloadTask,
        tags=["下载任务"],
    )
    async def get_task(task_id: str, request: Request) -> DownloadTask:
        tasks: DownloadTaskCoordinator = request.app.state.tasks
        task = await tasks.get(task_id)
        if not task:
            raise HTTPException(status_code=404, detail="下载任务不存在")
        return task

    @api.post(
        "/tasks/{task_id}/retry",
        response_model=DownloadTask,
        status_code=202,
        tags=["下载任务"],
    )
    async def retry_task(task_id: str, request: Request) -> DownloadTask:
        tasks: DownloadTaskCoordinator = request.app.state.tasks
        task = await tasks.retry(task_id)
        if not task:
            raise HTTPException(status_code=404, detail="下载任务不存在")
        return task

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


async def run_api(
    settings: AppSettings,
    settings_file: Path | None = None,
    settings_override_fields: set[str] | None = None,
) -> None:
    """启动 HTTP API 服务。

    Args:
        settings: 服务器与下载配置。
        settings_file: 管理后台维护的 dotenv 文件。
        settings_override_fields: 启动参数覆盖的配置字段。
    """
    configure_logging(settings.log_level)
    server = Server(
        Config(
            create_api(
                settings,
                settings_file=settings_file,
                settings_override_fields=settings_override_fields,
            ),
            host=settings.server_host,
            port=settings.server_port,
            log_level=settings.log_level,
            log_config=None,
        )
    )
    await server.serve()
