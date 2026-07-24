"""作品解析与下载应用服务。"""

import os
from asyncio import to_thread
from datetime import UTC, datetime
from hashlib import sha256
from pathlib import Path

from loguru import logger

from xhs_core.domain.links import extract_supported_links, is_short_link
from xhs_core.domain.models import DownloadOutcome, DownloadRecord, WorkDetail
from xhs_core.domain.ports import (
    ArtifactDownloader,
    DetailParser,
    DownloadRepository,
    DownloadSettings,
    PageGateway,
)


class DownloadService:
    """编排链接解析、页面解析、缓存校验、下载与记录持久化。

    服务只负责用例顺序，不包含 HTTP、文件传输或 SQLite 细节。调用方负责通过
    异步上下文管理器控制网络连接生命周期。

    Args:
        settings: 应用配置。
        gateway: 页面和媒体网络端口。
        parser: 作品详情解析端口。
        downloader: 文件下载端口。
        repository: 下载记录仓储端口。
    """

    def __init__(
        self,
        settings: DownloadSettings,
        gateway: PageGateway,
        parser: DetailParser,
        downloader: ArtifactDownloader,
        repository: DownloadRepository,
    ) -> None:
        self.settings = settings
        self._gateway = gateway
        self._parser = parser
        self._downloader = downloader
        self._repository = repository

    async def __aenter__(self) -> "DownloadService":
        enter = getattr(self._gateway, "__aenter__", None)
        if enter:
            await enter()
        return self

    async def __aexit__(self, exc_type, exc_value, traceback) -> None:
        close = getattr(self._gateway, "close", None)
        if close:
            await close()

    async def get_detail(
        self,
        text: str,
        cookie: str | None = None,
    ) -> WorkDetail:
        """解析输入中的第一个作品并返回结构化详情。

        Args:
            text: 作品链接或包含作品链接的文本。
            cookie: 覆盖配置的单次请求 Cookie。

        Returns:
            经过领域模型验证的作品详情。
        """
        url = await self.normalize_url(text)
        logger.info("开始解析作品 {}", _work_id_for_log(url))
        html = await self._gateway.get_text(url, cookie)
        detail = self._parser.parse(html, url)
        mapped_name = self.settings.mapping_data.get(detail.author.author_id)
        if mapped_name:
            detail.author.nickname = mapped_name
        logger.info("作品 {} 解析完成", detail.work_id)
        return detail

    async def download(
        self,
        text: str,
        indexes: set[int] | None = None,
        force: bool = False,
        cookie: str | None = None,
    ) -> DownloadOutcome:
        """解析并下载一个作品。

        Args:
            text: 作品链接或包含作品链接的文本。
            indexes: 仅下载指定的一基图片序号。
            force: 是否忽略有效下载记录并重新下载。
            cookie: 覆盖配置的单次请求 Cookie。

        Returns:
            包含作品详情、文件哈希和跳过状态的结果。
        """
        detail = await self.get_detail(text, cookie)
        fingerprint = detail.fingerprint()
        if self.settings.download_record and not force:
            record = await self._repository.get(detail.work_id)
            if record and await self._record_is_current(record, fingerprint):
                logger.info("作品 {} 的本地产物校验通过，跳过下载", detail.work_id)
                return DownloadOutcome(
                    message="本地产物完整且内容指纹未变化，跳过下载",
                    detail=detail,
                    artifacts=record.artifacts,
                    skipped=True,
                )
        artifacts = await self._downloader.download(detail, indexes)
        if self.settings.record_data:
            await self._save_metadata(detail)
        if self.settings.download_record and artifacts:
            await self._repository.save(
                DownloadRecord(
                    work_id=detail.work_id,
                    source_fingerprint=fingerprint,
                    artifacts=artifacts,
                    updated_at=datetime.now(UTC),
                )
            )
        logger.info(
            "作品 {} 下载完成，共生成 {} 个文件", detail.work_id, len(artifacts)
        )
        message = "作品文件下载完成" if artifacts else "没有符合当前配置的媒体文件"
        return DownloadOutcome(
            message=message,
            detail=detail,
            artifacts=artifacts,
        )

    async def normalize_url(self, text: str) -> str:
        """提取并规范化第一个受支持的作品链接。

        Args:
            text: 用户输入文本。

        Returns:
            可直接请求的最终作品地址。
        """
        url = extract_supported_links(text)[0]
        if is_short_link(url):
            resolved = await self._gateway.resolve(url)
            return extract_supported_links(resolved)[0]
        return url

    async def _record_is_current(
        self,
        record: DownloadRecord,
        fingerprint: str,
    ) -> bool:
        if record.source_fingerprint != fingerprint or not record.artifacts:
            return False
        root = self.settings.output_root
        for artifact in record.artifacts:
            file = root.joinpath(artifact.path).resolve()
            if not file.is_relative_to(root) or not file.is_file():
                return False
            if file.stat().st_size != artifact.size:
                return False
            if await to_thread(_hash_file, file) != artifact.sha256:
                return False
        return True

    async def _save_metadata(self, detail: WorkDetail) -> None:
        folder = self.settings.state_dir.joinpath("metadata")
        folder.mkdir(parents=True, exist_ok=True)
        target = folder.joinpath(f"{detail.work_id}.json")
        temporary = target.with_suffix(".json.tmp")
        content = detail.model_dump_json(by_alias=True, indent=2)
        await to_thread(temporary.write_text, content, encoding="utf-8")
        await to_thread(os.replace, temporary, target)


def _hash_file(path: Path) -> str:
    digest = sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _work_id_for_log(url: str) -> str:
    return url.partition("?")[0].rstrip("/").rsplit("/", 1)[-1]
