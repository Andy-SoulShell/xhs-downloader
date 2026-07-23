"""作品链接识别测试。"""

import pytest

from src.domain import InvalidLinkError
from src.domain.links import extract_supported_links, is_short_link


def test_links_preserve_input_order_and_strip_punctuation() -> None:
    """确保混合链接保持出现顺序并清理自然语言标点。"""
    short = "https://xhslink.com/synthetic-short"
    direct = "https://www.xiaohongshu.com/explore/synthetic-work"
    text = f"先处理 {short}，然后处理 {direct}。"

    assert extract_supported_links(text) == [short, direct]


def test_links_are_deduplicated() -> None:
    """确保同一作品链接只返回一次。"""
    direct = "https://www.xiaohongshu.com/explore/synthetic-work"

    assert extract_supported_links(f"{direct} {direct}") == [direct]


def test_cn_short_link_and_missing_scheme_are_supported() -> None:
    """确保 .cn 分享链接可用，且省略协议时补充 HTTPS。"""
    link = "xhslink.cn/synthetic-short"

    assert extract_supported_links(f"复制链接 {link} 打开应用") == [f"https://{link}"]
    assert is_short_link(f"https://{link}")


def test_com_short_link_remains_supported() -> None:
    """确保原有 .com 分享链接兼容性不受影响。"""
    link = "https://xhslink.com/synthetic-short"

    assert extract_supported_links(link) == [link]
    assert is_short_link(link)


def test_spoofed_short_link_domain_is_rejected() -> None:
    """确保名称相似的非官方域名不会被当作短链接。"""
    text = "https://evil-xhslink.cn/synthetic https://xhslink.cn.example/synthetic"

    with pytest.raises(InvalidLinkError):
        extract_supported_links(text)
