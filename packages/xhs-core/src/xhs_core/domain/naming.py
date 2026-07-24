"""文件与目录命名规则。"""

import re
from datetime import datetime

from .models import WorkDetail

INVALID_CHARACTER = re.compile(r'[\\/:*?"<>|\x00-\x1f]')
REPEATED_SEPARATOR = re.compile(r"_+")
SUPPORTED_KEYS = {
    "发布时间",
    "作者昵称",
    "作者ID",
    "作品标题",
    "作品ID",
    "作品类型",
}


def sanitize_segment(value: str, fallback: str = "未命名", limit: int = 128) -> str:
    """把不可信文本转换为安全的单段文件名。

    Args:
        value: 原始文本。
        fallback: 清理结果为空时使用的名称。
        limit: 最大字符数。

    Returns:
        不包含路径分隔符和控制字符的名称。
    """
    cleaned = INVALID_CHARACTER.sub("_", value)
    cleaned = REPEATED_SEPARATOR.sub("_", cleaned).strip(" ._")
    return (cleaned or fallback)[:limit].rstrip(" .")


def build_work_name(detail: WorkDetail, pattern: str) -> str:
    """根据结构化作品信息生成文件名。

    Args:
        detail: 作品领域模型。
        pattern: 由空格分隔的中文字段名称。

    Returns:
        清理并限制长度后的文件名。
    """
    values = _naming_values(detail)
    keys = pattern.split()
    if not keys or any(key not in SUPPORTED_KEYS for key in keys):
        keys = ["发布时间", "作者昵称", "作品标题"]
    raw = "_".join(values[key] for key in keys)
    return sanitize_segment(raw, fallback=f"{detail.author.author_id}_{detail.work_id}")


def _naming_values(detail: WorkDetail) -> dict[str, str]:
    published = _format_time(detail.published_at)
    return {
        "发布时间": published,
        "作者昵称": detail.author.nickname,
        "作者ID": detail.author.author_id,
        "作品标题": sanitize_segment(detail.title, detail.work_id, 64),
        "作品ID": detail.work_id,
        "作品类型": detail.work_type.value,
    }


def _format_time(value: datetime | None) -> str:
    return value.strftime("%Y-%m-%d_%H.%M.%S") if value else "未知时间"
