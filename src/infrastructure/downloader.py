"""支持断点恢复和原子替换的文件下载器。"""

import os
from asyncio import Semaphore, gather, sleep, to_thread
from hashlib import sha256
from pathlib import Path
from typing import ClassVar

from aiofiles import open as async_open
from loguru import logger

from src.config import AppSettings
from src.domain.errors import DownloadError, InvalidPartialContentError
from src.domain.models import DownloadArtifact, MediaKind, MediaResource, WorkDetail
from src.domain.naming import build_work_name, sanitize_segment
from src.domain.ports import PageGateway


class FileDownloader:
    """把领域媒体资源安全写入文件系统。

    未完成内容保存在状态目录，并用 URL 指纹防止错误续传；完成后通过原子替换
    进入下载目录。

    Args:
        settings: 路径、并发和下载开关配置。
        gateway: 提供媒体响应流的网络端口。
    """

    CONTENT_TYPE_SUFFIX: ClassVar[dict[str, str]] = {
        "image/avif": "avif",
        "image/heic": "heic",
        "image/jpeg": "jpeg",
        "image/png": "png",
        "image/webp": "webp",
        "video/mp4": "mp4",
    }

    def __init__(self, settings: AppSettings, gateway: PageGateway) -> None:
        self._settings = settings
        self._gateway = gateway
        self._semaphore = Semaphore(settings.max_concurrency)

    async def download(
        self,
        detail: WorkDetail,
        indexes: set[int] | None = None,
    ) -> list[DownloadArtifact]:
        """并发下载符合开关和序号条件的媒体。

        Args:
            detail: 已解析的作品信息。
            indexes: 仅下载指定的一基媒体序号。

        Returns:
            完整且包含 SHA-256 的文件产物。

        Raises:
            DownloadError: 任意选中媒体最终下载失败。
        """
        resources = [
            resource
            for resource in detail.media
            if self._enabled(resource) and (not indexes or resource.index in indexes)
        ]
        if not resources:
            return []
        folder = self._target_folder(detail)
        name = build_work_name(detail, self._settings.name_format)
        tasks = [
            self._download_with_retry(detail, resource, folder, name)
            for resource in resources
        ]
        return list(await gather(*tasks))

    def _enabled(self, resource: MediaResource) -> bool:
        switches = {
            MediaKind.VIDEO: self._settings.video_download,
            MediaKind.IMAGE: self._settings.image_download,
            MediaKind.LIVE: self._settings.live_download,
        }
        return switches[resource.kind]

    def _target_folder(self, detail: WorkDetail) -> Path:
        folder = self._settings.download_dir
        if self._settings.author_archive:
            folder = folder.joinpath(
                sanitize_segment(detail.author.nickname, detail.author.author_id)
            )
        if self._settings.folder_mode:
            folder = folder.joinpath(
                build_work_name(detail, self._settings.name_format)
            )
        folder.mkdir(parents=True, exist_ok=True)
        return folder

    async def _download_with_retry(
        self,
        detail: WorkDetail,
        resource: MediaResource,
        folder: Path,
        work_name: str,
    ) -> DownloadArtifact:
        last_error: DownloadError | None = None
        for attempt in range(self._settings.max_retry + 1):
            try:
                return await self._download_one(detail, resource, folder, work_name)
            except DownloadError as error:
                last_error = error
                if attempt < self._settings.max_retry:
                    await sleep(min(2**attempt, 4))
        raise DownloadError(f"文件下载重试耗尽：{last_error}") from last_error

    async def _download_one(
        self,
        detail: WorkDetail,
        resource: MediaResource,
        folder: Path,
        work_name: str,
    ) -> DownloadArtifact:
        async with self._semaphore:
            part, marker = self._partial_paths(detail, resource)
            self._prepare_partial(part, marker, resource.url)
            resume_at = part.stat().st_size if part.exists() else 0
            headers = {"Range": f"bytes={resume_at}-"} if resume_at else None
            suffix = resource.suffix
            try:
                async with self._gateway.stream(resource.url, headers) as response:
                    suffix = self._response_suffix(
                        response.headers.get("Content-Type", ""),
                        resource.suffix,
                    )
                    mode = "ab" if resume_at and response.status_code == 206 else "wb"
                    async with async_open(part, mode) as output:
                        async for chunk in response.aiter_bytes(self._settings.chunk):
                            await output.write(chunk)
            except InvalidPartialContentError:
                part.unlink(missing_ok=True)
                marker.unlink(missing_ok=True)
                raise
            if not part.exists() or part.stat().st_size == 0:
                raise DownloadError(f"下载结果为空：{resource.url}")
            target = folder.joinpath(self._filename(work_name, resource, suffix))
            target.parent.mkdir(parents=True, exist_ok=True)
            os.replace(part, target)
            marker.unlink(missing_ok=True)
            if self._settings.write_mtime and detail.published_at:
                timestamp = detail.published_at.timestamp()
                os.utime(target, (timestamp, timestamp))
            digest = await to_thread(_hash_file, target)
            relative = target.relative_to(self._settings.output_root)
            logger.success("文件下载完成：{}", relative)
            return DownloadArtifact(
                path=str(relative),
                sha256=digest,
                size=target.stat().st_size,
                media_index=resource.index,
                kind=resource.kind,
            )

    def _partial_paths(
        self,
        detail: WorkDetail,
        resource: MediaResource,
    ) -> tuple[Path, Path]:
        self._settings.temp_dir.mkdir(parents=True, exist_ok=True)
        stem = f"{detail.work_id}_{resource.kind.value}_{resource.index}"
        part = self._settings.temp_dir.joinpath(f"{stem}.part")
        return part, part.with_suffix(".part.url")

    @staticmethod
    def _prepare_partial(part: Path, marker: Path, url: str) -> None:
        url_fingerprint = sha256(url.encode("utf-8")).hexdigest()
        marker_matches = (
            marker.exists() and marker.read_text(encoding="utf-8") == url_fingerprint
        )
        if part.exists() and not marker_matches:
            part.unlink(missing_ok=True)
        marker.write_text(url_fingerprint, encoding="utf-8")

    @staticmethod
    def _filename(
        work_name: str,
        resource: MediaResource,
        suffix: str,
    ) -> str:
        if resource.kind is MediaKind.VIDEO:
            stem = work_name
        elif resource.kind is MediaKind.LIVE:
            stem = f"{work_name}_{resource.index}_live"
        else:
            stem = f"{work_name}_{resource.index}"
        return f"{stem}.{suffix}"

    @classmethod
    def _response_suffix(cls, content_type: str, configured: str) -> str:
        if configured != "auto":
            return configured
        normalized = content_type.partition(";")[0].strip().lower()
        return cls.CONTENT_TYPE_SUFFIX.get(normalized, "jpeg")


def _hash_file(path: Path) -> str:
    digest = sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()
