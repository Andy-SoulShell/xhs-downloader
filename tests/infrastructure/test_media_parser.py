"""媒体资源地址解析测试。"""

import pytest

from src.config import ImageFormat, VideoPreference
from src.domain import MediaKind, WorkType
from src.infrastructure.media_parser import MediaParser

SIGNED_IMAGE_URL = (
    "http://sns-webpic-qc.xhscdn.com/"
    "202607232303/0123456789abcdef0123456789abcdef/"
    "notes_pre_post/synthetic-token!nd_dft_wlteh_jpg_3"
)


def test_fixed_format_removes_ephemeral_cdn_route() -> None:
    """确保格式转换地址不携带仅适用于原域名的临时路由。"""
    resource = _parse_image(SIGNED_IMAGE_URL, ImageFormat.JPEG)

    assert resource.url == (
        "https://ci.xiaohongshu.com/notes_pre_post/synthetic-token"
        "?imageView2/format/jpeg"
    )


def test_auto_format_removes_ephemeral_cdn_route() -> None:
    """确保自动格式地址使用稳定资源键。"""
    resource = _parse_image(SIGNED_IMAGE_URL, ImageFormat.AUTO)

    assert resource.url == (
        "https://sns-img-bd.xhscdn.com/notes_pre_post/synthetic-token"
    )


def test_stable_image_path_is_preserved() -> None:
    """确保不含临时路由的多段资源键不会被误删。"""
    raw_url = (
        "https://sns-img-bd.xhscdn.com/"
        "notes_pre_post/synthetic-token!nd_dft_wlteh_webp_3"
    )

    resource = _parse_image(raw_url, ImageFormat.AUTO)

    assert resource.url == (
        "https://sns-img-bd.xhscdn.com/notes_pre_post/synthetic-token"
    )


def test_origin_video_is_preferred_and_decoded() -> None:
    """确保原始视频键优先于转码流并规范转义字符。"""
    parser = MediaParser(ImageFormat.JPEG, VideoPreference.RESOLUTION)

    resources = parser.parse(
        {"video": {"consumer": {"originVideoKey": "folder\\u002Fvideo.mp4"}}},
        WorkType.VIDEO,
    )

    assert resources[0].url == "https://sns-video-bd.xhscdn.com/folder/video.mp4"
    assert resources[0].kind is MediaKind.VIDEO


@pytest.mark.parametrize(
    ("preference", "expected"),
    [
        (VideoPreference.RESOLUTION, "https://example.invalid/high"),
        (VideoPreference.BITRATE, "https://example.invalid/fast"),
        (VideoPreference.SIZE, "https://example.invalid/fast"),
    ],
)
def test_video_stream_selection_honors_preference(
    preference: VideoPreference,
    expected: str,
) -> None:
    """确保备用视频流按配置维度选择最大值。

    Args:
        preference: 视频流排序策略。
        expected: 预期选中的媒体地址。
    """
    streams = {
        "h264": [
            {
                "height": 1080,
                "videoBitrate": 100,
                "size": 1000,
                "backupUrls": ["https:\\u002F\\u002Fexample.invalid\\u002Fhigh"],
            }
        ],
        "h265": [
            {
                "height": 720,
                "videoBitrate": 200,
                "size": 2000,
                "masterUrl": "https://example.invalid/fast",
            }
        ],
    }
    parser = MediaParser(ImageFormat.JPEG, preference)

    resources = parser.parse(
        {"video": {"media": {"stream": streams}}},
        WorkType.VIDEO,
    )

    assert resources[0].url == expected


def test_image_parser_keeps_live_companion_resource() -> None:
    """确保图文作品同时保留静态图片和动态图片资源。"""
    parser = MediaParser(ImageFormat.AUTO, VideoPreference.RESOLUTION)
    note = {
        "imageList": [
            {
                "url": "https://sns-img-bd.xhscdn.com/synthetic-image",
                "stream": {
                    "h264": [
                        {"masterUrl": "https:\\u002F\\u002Fexample.invalid/live.mp4"}
                    ]
                },
            }
        ]
    }

    resources = parser.parse(note, WorkType.IMAGE)

    assert [resource.kind for resource in resources] == [
        MediaKind.IMAGE,
        MediaKind.LIVE,
    ]
    assert resources[1].url == "https://example.invalid/live.mp4"


def test_unsupported_or_empty_media_returns_no_resources() -> None:
    """确保未知作品和缺少有效流的视频不产生虚假资源。"""
    parser = MediaParser(ImageFormat.JPEG, VideoPreference.RESOLUTION)

    assert parser.parse({}, WorkType.UNKNOWN) == []
    assert parser.parse({"video": {}}, WorkType.VIDEO) == []


def _parse_image(raw_url: str, image_format: ImageFormat):
    parser = MediaParser(image_format, VideoPreference.RESOLUTION)
    resources = parser.parse(
        {"imageList": [{"urlDefault": raw_url}]},
        WorkType.IMAGE,
    )
    return resources[0]
