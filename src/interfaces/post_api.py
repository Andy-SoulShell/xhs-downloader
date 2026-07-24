"""采集帖子与详情解析 HTTP 接口。"""

from fastapi import APIRouter, Query, Request

from src.application import DownloadService
from src.domain import WorkDetail
from src.infrastructure import SqlitePostRepository

from .api_models import DetailRequest, DetailResponse


def create_post_router(repository: SqlitePostRepository) -> APIRouter:
    """创建采集帖子路由。

    Args:
        repository: 采集帖子持久化仓储。

    Returns:
        可挂载到主应用的路由。
    """
    router = APIRouter(tags=["作品"])

    @router.get("/posts", response_model=list[WorkDetail])
    async def list_posts(
        limit: int = Query(default=500, ge=1, le=500),
    ) -> list[WorkDetail]:
        return await repository.list_recent(limit)

    @router.delete("/posts/{work_id}", status_code=204)
    async def delete_post(work_id: str) -> None:
        await repository.delete(work_id)

    @router.post("/xhs/detail", response_model=DetailResponse)
    async def detail(payload: DetailRequest, request: Request) -> DetailResponse:
        service: DownloadService = request.app.state.service
        if payload.download:
            outcome = await service.download(
                payload.url,
                set(payload.index or []),
                payload.force,
                payload.cookie,
            )
            await repository.save(outcome.detail)
            return DetailResponse(
                message=outcome.message,
                data=outcome.detail.public_dict(),
                files=outcome.artifacts,
                skipped=outcome.skipped,
            )
        work = await service.get_detail(payload.url, payload.cookie)
        await repository.save(work)
        return DetailResponse(message="作品信息解析完成", data=work.public_dict())

    return router
