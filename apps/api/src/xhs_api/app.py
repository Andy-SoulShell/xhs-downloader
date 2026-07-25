"""FastAPI 接口。"""

from collections.abc import AsyncIterator, Callable
from contextlib import AsyncExitStack, asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from uvicorn import Config, Server
from xhs_adapters import create_download_service
from xhs_adapters.config import AppSettings
from xhs_adapters.logging import configure_logging
from xhs_core.application import (
    CollectionService,
    DownloadService,
    DownloadTaskCoordinator,
)
from xhs_core.domain import ProviderError, XhsError
from xhs_core.version import VERSION

from .bootstrap import create_api_dependencies
from .browser import create_browser_router
from .browser_operations import create_browser_operation_router
from .capability_reads import create_capability_read_router
from .extension import create_extension_router
from .login import create_login_router
from .managed_browser import create_managed_browser_router
from .posts import create_post_router
from .publication import create_publication_router
from .settings import (
    SettingsAccessPolicy,
    allow_loopback_settings,
    create_settings_router,
)
from .tasks import create_task_router

ServiceFactory = Callable[[AppSettings], DownloadService]
EXTENSION_ORIGIN_PATTERN = (
    r"^(chrome-extension|moz-extension|safari-web-extension)://"
    r"[A-Za-z0-9._-]+$"
)


def create_api(
    settings: AppSettings | None = None,
    service_factory: ServiceFactory = create_download_service,
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
    dependencies = create_api_dependencies(
        resolved_settings,
        resolved_settings_file,
        settings_override_fields,
    )

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        async with service_factory(resolved_settings) as service:
            tasks = DownloadTaskCoordinator(
                service,
                dependencies.download_tasks,
                resolved_settings.max_concurrency,
            )
            app.state.service = service
            app.state.tasks = tasks
            app.state.collection = CollectionService(service, dependencies.posts)
            async with AsyncExitStack() as lifecycle:
                lifecycle.push_async_callback(tasks.close)
                lifecycle.push_async_callback(dependencies.publication.scheduler.close)
                lifecycle.push_async_callback(dependencies.browser.managed.close)
                lifecycle.push_async_callback(dependencies.browser.worker.close)
                lifecycle.push_async_callback(dependencies.publication.worker.close)
                lifecycle.push_async_callback(dependencies.capabilities.close)
                await tasks.start()
                await dependencies.publication.scheduler.start()
                await dependencies.publication.worker.start()
                await dependencies.browser.worker.start()
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
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=[
            "Authorization",
            "Content-Type",
            "Range",
            "X-Extension-Id",
            "X-Browser-Lease",
            "X-Publish-Lease",
        ],
        expose_headers=[
            "Accept-Ranges",
            "Content-Length",
            "Content-Range",
        ],
    )
    api.include_router(
        create_browser_router(
            dependencies.browser.tasks,
            dependencies.browser.execution,
            dependencies.publication.credentials,
            settings_access_policy,
        )
    )
    api.include_router(
        create_capability_read_router(
            dependencies.capabilities,
            settings_access_policy,
        )
    )
    api.include_router(
        create_browser_operation_router(
            dependencies.browser.tasks,
            lambda: dependencies.settings.current.browser_driver,
            settings_access_policy,
        )
    )
    api.include_router(
        create_managed_browser_router(
            dependencies.browser.managed,
            settings_access_policy,
        )
    )
    api.include_router(
        create_login_router(
            dependencies.browser.tasks,
            dependencies.settings,
            lambda: dependencies.settings.current.browser_driver,
            settings_access_policy,
        )
    )
    api.include_router(
        create_settings_router(dependencies.settings, settings_access_policy)
    )
    api.include_router(create_post_router())
    api.include_router(create_extension_router(dependencies.client_records))
    api.include_router(create_task_router())
    api.include_router(
        create_publication_router(
            dependencies.publication.drafts,
            dependencies.publication.tasks,
            dependencies.publication.execution,
            dependencies.publication.credentials,
            settings_access_policy,
            lambda: dependencies.settings.current.browser_driver,
        )
    )

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
