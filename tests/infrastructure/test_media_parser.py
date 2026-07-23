"""媒体资源地址解析测试。"""

from src.config import ImageFormat, VideoPreference
from src.domain import WorkType
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


def _parse_image(raw_url: str, image_format: ImageFormat):
    parser = MediaParser(image_format, VideoPreference.RESOLUTION)
    resources = parser.parse(
        {"imageList": [{"urlDefault": raw_url}]},
        WorkType.IMAGE,
    )
    return resources[0]
