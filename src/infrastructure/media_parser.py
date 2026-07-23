"""从作品状态对象提取媒体资源。"""

import re
from typing import Any
from urllib.parse import urlsplit

from src.config import ImageFormat, VideoPreference
from src.domain.models import MediaKind, MediaResource, WorkType

EPHEMERAL_IMAGE_ROUTE_PREFIX = re.compile(r"^\d{12}/[0-9a-f]{32}/", re.IGNORECASE)


class MediaParser:
    """按下载配置选择作品媒体地址。

    Args:
        image_format: 图片服务端转换格式。
        video_preference: 备用视频流排序策略。
    """

    def __init__(
        self,
        image_format: ImageFormat,
        video_preference: VideoPreference,
    ) -> None:
        self._image_format = image_format
        self._video_preference = video_preference

    def parse(self, note: dict[str, Any], work_type: WorkType) -> list[MediaResource]:
        """提取视频、图片和动态图片资源。

        Args:
            note: 页面中的原始作品对象。
            work_type: 已分类的作品类型。

        Returns:
            按作品顺序排列的媒体资源。
        """
        if work_type is WorkType.VIDEO:
            return self._video_resources(note)
        if work_type in {WorkType.IMAGE, WorkType.GALLERY}:
            return self._image_resources(note)
        return []

    def _video_resources(self, note: dict[str, Any]) -> list[MediaResource]:
        origin_key = _deep_get(note, "video.consumer.originVideoKey")
        if origin_key:
            url = f"https://sns-video-bd.xhscdn.com/{origin_key}"
        else:
            url = self._select_video_stream(note)
        if not url:
            return []
        return [
            MediaResource(
                index=1,
                kind=MediaKind.VIDEO,
                url=_decode_url(str(url)),
                suffix="mp4",
                preview_url=self._video_preview(note),
            )
        ]

    def _video_preview(self, note: dict[str, Any]) -> str | None:
        images = _as_list(note.get("imageList"))
        if not images:
            return None
        raw_url = str(images[0].get("urlDefault") or images[0].get("url") or "")
        return self._image_url(raw_url) if raw_url else None

    def _select_video_stream(self, note: dict[str, Any]) -> str:
        streams = [
            *_as_list(_deep_get(note, "video.media.stream.h264", [])),
            *_as_list(_deep_get(note, "video.media.stream.h265", [])),
        ]
        if not streams:
            return ""
        key = {
            VideoPreference.RESOLUTION: lambda item: _number(item.get("height")),
            VideoPreference.BITRATE: lambda item: _number(item.get("videoBitrate")),
            VideoPreference.SIZE: lambda item: _number(item.get("size")),
        }[self._video_preference]
        selected = max(streams, key=key)
        backups = selected.get("backupUrls")
        if isinstance(backups, list):
            first_backup = next(
                (item for item in backups if isinstance(item, str) and item),
                "",
            )
            if first_backup:
                return first_backup
        return str(selected.get("masterUrl", ""))

    def _image_resources(self, note: dict[str, Any]) -> list[MediaResource]:
        result: list[MediaResource] = []
        for index, image in enumerate(_as_list(note.get("imageList")), start=1):
            image_url = str(image.get("urlDefault") or image.get("url") or "")
            if image_url:
                result.append(
                    MediaResource(
                        index=index,
                        kind=MediaKind.IMAGE,
                        url=self._image_url(image_url),
                        suffix=self._image_suffix,
                    )
                )
            live_url = _deep_get(image, "stream.h264.0.masterUrl")
            if live_url:
                result.append(
                    MediaResource(
                        index=index,
                        kind=MediaKind.LIVE,
                        url=_decode_url(str(live_url)),
                        suffix="mp4",
                    )
                )
        return result

    def _image_url(self, raw_url: str) -> str:
        token = _extract_image_token(raw_url)
        if self._image_format is ImageFormat.AUTO:
            return f"https://sns-img-bd.xhscdn.com/{token}"
        return (
            f"https://ci.xiaohongshu.com/{token}"
            f"?imageView2/format/{self._image_format.value}"
        )

    @property
    def _image_suffix(self) -> str:
        if self._image_format is ImageFormat.AUTO:
            return "auto"
        return self._image_format.value


def _deep_get(data: Any, path: str, default: Any = "") -> Any:
    current = data
    for part in path.split("."):
        try:
            current = current[int(part)] if part.isdigit() else current[part]
        except (IndexError, KeyError, TypeError):
            return default
    return current if current is not None else default


def _as_list(value: Any) -> list:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, dict)]


def _number(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0


def _decode_url(value: str) -> str:
    return value.replace("\\u002F", "/").replace("\\/", "/").replace("\\u0026", "&")


def _extract_image_token(value: str) -> str:
    """从图片地址中提取可跨 CDN 使用的稳定资源键。

    页面可能返回带时间戳和签名摘要的临时路由；这些前缀仅对原始域名有效，
    不能随资源键一起交给图片转换服务。

    Args:
        value: 页面返回的原始图片地址。

    Returns:
        已移除临时路由和图片样式后缀的资源键。
    """
    path = urlsplit(_decode_url(value)).path.lstrip("/")
    stable_path = EPHEMERAL_IMAGE_ROUTE_PREFIX.sub("", path, count=1)
    return stable_path.partition("!")[0]
