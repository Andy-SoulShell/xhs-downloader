"""浏览器扩展协作 HTTP 接口。"""

from fastapi import APIRouter, Query
from xhs_core.domain import ClientDownloadRecord, DownloadMode
from xhs_core.domain.ports import ClientRecordRepository
from xhs_core.version import VERSION

from .models import ClientRecordBatch, ExtensionCapabilities


def create_extension_router(records: ClientRecordRepository) -> APIRouter:
    """创建扩展能力与记录路由。

    Args:
        records: 浏览器扩展下载记录仓储。

    Returns:
        可挂载到主应用的路由。
    """
    router = APIRouter(prefix="/extension", tags=["浏览器扩展"])

    @router.get("/capabilities", response_model=ExtensionCapabilities)
    async def extension_capabilities() -> ExtensionCapabilities:
        return ExtensionCapabilities(
            protocol_version=3,
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
                "browser_tasks": True,
            },
        )

    @router.post("/records")
    async def save_client_records(payload: ClientRecordBatch) -> dict[str, int]:
        accepted = await records.save_many(payload.records)
        return {"accepted": accepted}

    @router.get("/records", response_model=list[ClientDownloadRecord])
    async def list_client_records(
        limit: int = Query(default=100, ge=1, le=500),
    ) -> list[ClientDownloadRecord]:
        return await records.list_recent(limit)

    return router
