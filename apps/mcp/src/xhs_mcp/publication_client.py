"""MCP 通过本机 FastAPI 提交发布草稿与素材。"""

from datetime import datetime
from mimetypes import guess_type
from pathlib import Path
from typing import Literal, Protocol

from httpx import AsyncClient, HTTPError, Response
from pydantic import BaseModel, ConfigDict, Field
from xhs_core.domain import (
    PublicationDraft,
    PublicationError,
    PublicationMode,
    PublicationTask,
    PublicationVisibility,
)


class PublicationSubmission(BaseModel):
    """MCP 已确认的发布请求，不包含浏览器凭据。"""

    model_config = ConfigDict(extra="forbid")

    title: str = Field(max_length=100)
    body: str = Field(max_length=5000)
    tags: list[str] = Field(default_factory=list, max_length=20)
    media_paths: list[Path] = Field(min_length=1, max_length=18)
    media_kind: Literal["image", "video"]
    scheduled_at: datetime | None = None
    visibility: PublicationVisibility = PublicationVisibility.PUBLIC
    is_original: bool = False
    products: list[str] = Field(default_factory=list, max_length=20)


class PublicationCapabilityClient(Protocol):
    """MCP 发布工具依赖的最小本机 API 客户端边界。"""

    async def submit(self, request: PublicationSubmission) -> dict[str, object]:
        """保存素材并创建发布任务。

        Args:
            request: 用户明确确认过的结构化发布请求。

        Returns:
            不含正文和本地路径的任务摘要。

        Raises:
            PublicationError: 文件或本机 API 请求无效。
        """
        ...


class HttpPublicationCapabilityClient:
    """通过 FastAPI 创建草稿、上传素材并提交任务。

    Args:
        client: 已配置本机 API 基础地址的异步 HTTP 客户端。
    """

    def __init__(self, client: AsyncClient) -> None:
        self._client = client

    async def submit(self, request: PublicationSubmission) -> dict[str, object]:
        """提交已确认发布请求，并返回最小任务摘要。

        Args:
            request: 已通过 MCP 参数校验的请求。

        Returns:
            发布任务标识、模式、状态和用户可见说明。

        Raises:
            PublicationError: 本地文件、媒体类型或 API 响应无效。
        """
        paths = [_resolve_media_path(path) for path in request.media_paths]
        _validate_media(paths, request.media_kind)
        if request.media_kind == "video" and len(paths) != 1:
            raise PublicationError("视频发布必须且只能提供一个视频文件")
        if request.media_kind == "video" and request.is_original:
            raise PublicationError("当前原创声明只支持图文笔记")
        draft = await self._create_draft(request)
        for path in paths:
            draft = await self._upload(draft.draft_id, path)
        task = await self._submit_task(draft.draft_id, request.scheduled_at)
        return {
            "task_id": task.task_id,
            "draft_id": task.package.draft_id,
            "mode": task.mode.value,
            "status": task.status.value,
            "scheduled_at": task.scheduled_at.isoformat(),
            "message": task.message,
        }

    async def _create_draft(
        self,
        request: PublicationSubmission,
    ) -> PublicationDraft:
        try:
            response = await self._client.post(
                "/publication/drafts",
                json={
                    "title": request.title,
                    "body": request.body,
                    "tags": request.tags,
                    "visibility": request.visibility.value,
                    "is_original": request.is_original,
                    "products": request.products,
                },
            )
            return PublicationDraft.model_validate(_response_json(response))
        except (HTTPError, ValueError) as error:
            raise PublicationError("无法通过本机 API 创建发布草稿") from error

    async def _upload(
        self,
        draft_id: str,
        path: Path,
    ) -> PublicationDraft:
        media_type = guess_type(path.name)[0] or "application/octet-stream"
        try:
            with path.open("rb") as source:
                response = await self._client.post(
                    f"/publication/drafts/{draft_id}/assets",
                    files={"upload": (path.name, source, media_type)},
                )
            return PublicationDraft.model_validate(_response_json(response))
        except (HTTPError, OSError, ValueError) as error:
            raise PublicationError(f"素材“{path.name}”上传失败") from error

    async def _submit_task(
        self,
        draft_id: str,
        scheduled_at: datetime | None,
    ) -> PublicationTask:
        mode = (
            PublicationMode.PLATFORM_SCHEDULED
            if scheduled_at
            else PublicationMode.MANUAL
        )
        try:
            response = await self._client.post(
                f"/publication/drafts/{draft_id}/submit",
                json={
                    "mode": mode.value,
                    "scheduled_at": (
                        scheduled_at.isoformat() if scheduled_at else None
                    ),
                },
            )
            return PublicationTask.model_validate(_response_json(response))
        except (HTTPError, ValueError) as error:
            raise PublicationError("无法通过本机 API 创建发布任务") from error


def _resolve_media_path(value: Path) -> Path:
    if not value.is_absolute():
        raise PublicationError("发布素材必须使用绝对路径")
    try:
        path = value.resolve(strict=True)
    except OSError as error:
        raise PublicationError(f"发布素材不存在：{value.name}") from error
    if not path.is_file():
        raise PublicationError(f"发布素材不是普通文件：{value.name}")
    return path


def _validate_media(paths: list[Path], expected: Literal["image", "video"]) -> None:
    for path in paths:
        media_type = guess_type(path.name)[0] or ""
        if not media_type.startswith(f"{expected}/"):
            label = "图片" if expected == "image" else "视频"
            raise PublicationError(f"素材“{path.name}”不是受支持的{label}文件")


def _response_json(response: Response) -> object:
    response.raise_for_status()
    return response.json()
