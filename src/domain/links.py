"""小红书作品链接的提取、规范化与分类。"""

import re
from urllib.parse import urlsplit

from .errors import InvalidLinkError

DIRECT_HOSTS = frozenset(
    {
        "xiaohongshu.com",
        "www.xiaohongshu.com",
        "rednote.com",
        "www.rednote.com",
    }
)
SHORT_HOSTS = frozenset(
    {
        "xhslink.com",
        "www.xhslink.com",
        "xhslink.cn",
        "www.xhslink.cn",
    }
)
LINK_CANDIDATE = re.compile(
    r"(?<![\w.-])"
    r"(?:https?://)?(?:www\.)?"
    r"(?:xiaohongshu\.com|rednote\.com|xhslink\.(?:com|cn))/"
    r"""[^\s"'<>\\^`{|}，。；！？、【】《》]+""",
    re.IGNORECASE,
)
TRAILING_PUNCTUATION = "，。；：！？、,.;:!?)）]】"


def extract_supported_links(text: str) -> list[str]:
    """从任意文本提取并规范化受支持的作品链接。

    Args:
        text: 可能包含多个作品链接或短链接的用户输入。

    Returns:
        按出现顺序去重后的绝对链接；省略协议时默认补充 HTTPS。

    Raises:
        InvalidLinkError: 输入中不存在结构有效且受支持的链接。
    """
    links: list[str] = []
    for match in LINK_CANDIDATE.finditer(text):
        candidate = _normalize_candidate(match.group())
        if candidate and candidate not in links:
            links.append(candidate)
    if not links:
        raise InvalidLinkError("未找到受支持的小红书作品链接")
    return links


def is_short_link(url: str) -> bool:
    """判断链接是否为受支持的小红书短链接。

    Args:
        url: 已规范化的绝对链接。

    Returns:
        域名属于 ``xhslink.com`` 或 ``xhslink.cn`` 且路径非空时返回真。
    """
    parsed = urlsplit(url)
    return (
        parsed.scheme.lower() in {"http", "https"}
        and _hostname(parsed.hostname) in SHORT_HOSTS
        and bool(parsed.path.strip("/"))
    )


def work_id_from_url(url: str) -> str:
    """从规范作品链接中提取作品 ID。

    Args:
        url: 已解析的作品链接。

    Returns:
        URL 路径末段中的作品 ID。

    Raises:
        InvalidLinkError: URL 路径不包含作品 ID。
    """
    work_id = urlsplit(url).path.rstrip("/").rsplit("/", 1)[-1]
    if not work_id:
        raise InvalidLinkError("作品链接缺少作品 ID")
    return work_id


def _normalize_candidate(value: str) -> str | None:
    """规范候选链接，并以域名和路径双重校验避免误匹配。"""
    candidate = value.rstrip(TRAILING_PUNCTUATION)
    if "://" not in candidate:
        candidate = f"https://{candidate}"
    parsed = urlsplit(candidate)
    if parsed.scheme.lower() not in {"http", "https"}:
        return None
    host = _hostname(parsed.hostname)
    if host in SHORT_HOSTS:
        return candidate if parsed.path.strip("/") else None
    if host not in DIRECT_HOSTS:
        return None
    segments = [segment for segment in parsed.path.split("/") if segment]
    if len(segments) == 2 and segments[0] == "explore":
        return candidate
    if len(segments) == 3 and segments[:2] == ["discovery", "item"]:
        return candidate
    return None


def _hostname(value: str | None) -> str:
    return (value or "").lower().rstrip(".")
