"""采集帖子与详情解析 HTTP 接口。"""

from fastapi import APIRouter, Query, Request
from xhs_core.application import CollectionService
from xhs_core.domain import WorkDetail

from .models import DetailRequest, DetailResponse


def create_post_router() -> APIRouter:
    """创建采集帖子路由。

    Returns:
        可挂载到主应用的路由。
    """
    router = APIRouter(tags=["作品"])

    @router.get("/posts", response_model=list[WorkDetail])
    async def list_posts(
        request: Request,
        limit: int = Query(default=500, ge=1, le=500),
    ) -> list[WorkDetail]:
        collection: CollectionService = request.app.state.collection
        return await collection.list_recent(limit)

    @router.delete("/posts/{work_id}", status_code=204)
    async def delete_post(work_id: str, request: Request) -> None:
        collection: CollectionService = request.app.state.collection
        await collection.delete(work_id)

    @router.post("/xhs/detail", response_model=DetailResponse)
    async def detail(payload: DetailRequest, request: Request) -> DetailResponse:
        collection: CollectionService = request.app.state.collection
        if payload.download:
            outcome = await collection.download(
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
        work = await collection.collect(payload.url, payload.cookie)
        return DetailResponse(message="作品信息解析完成", data=work.public_dict())

    return router
