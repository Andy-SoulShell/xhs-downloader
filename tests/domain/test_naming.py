"""文件与目录命名规则测试。"""

from src.domain.naming import build_work_name, sanitize_segment
from tests.helpers import make_detail


def test_sanitize_segment_removes_unsafe_characters() -> None:
    """确保文件名不含路径分隔符、控制字符和多余分隔符。"""
    result = sanitize_segment('  a//b:*?"<>|\x00__c.  ')

    assert result == "a_b_c"


def test_sanitize_segment_uses_fallback_and_limit() -> None:
    """确保空名称采用后备值且长度受限。"""
    assert sanitize_segment("...", "后备名称") == "后备名称"
    assert sanitize_segment("abcdef", limit=4) == "abcd"


def test_build_work_name_uses_requested_fields() -> None:
    """确保命名模板按声明顺序组合领域字段。"""
    detail = make_detail()

    name = build_work_name(detail, "作品ID 作品类型 作者ID")

    assert name == "synthetic-work_视频_synthetic-author"


def test_build_work_name_falls_back_for_invalid_pattern() -> None:
    """确保无效模板回退到稳定的默认命名规则。"""
    detail = make_detail()

    name = build_work_name(detail, "不存在的字段")

    assert name == "2024-01-02_03.04.05_合成作者_合成_测试_作品"


def test_build_work_name_handles_missing_published_time() -> None:
    """确保缺少发布时间时仍能生成可读名称。"""
    detail = make_detail().model_copy(update={"published_at": None})

    assert build_work_name(detail, "发布时间") == "未知时间"
