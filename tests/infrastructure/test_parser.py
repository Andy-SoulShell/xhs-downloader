"""合成作品页面解析测试。"""

import pytest
from xhs_adapters.config import AppSettings
from xhs_adapters.parsing import InitialStateParser
from xhs_core.domain import ParseError, WorkType

from tests.helpers import make_initial_state_html

WORK_ID = "synthetic000000000000000001"
URL = f"https://www.xiaohongshu.com/explore/{WORK_ID}"


def test_parser_builds_typed_video_detail() -> None:
    """确保合成视频页面被转换为完整领域模型。"""
    parser = InitialStateParser(AppSettings())
    detail = parser.parse(make_initial_state_html(work_id=WORK_ID), URL)

    assert detail.work_id == WORK_ID
    assert detail.work_type is WorkType.VIDEO
    assert detail.author.nickname == "合成作者"
    assert detail.author.avatar_url == "https://example.invalid/avatar.jpeg"
    assert detail.tags == ["公版测试"]
    assert detail.media[0].url.endswith("synthetic.mp4")
    assert len(detail.fingerprint()) == 64
    fingerprint = detail.fingerprint()
    detail.author.avatar_url = "https://example.invalid/new-avatar.jpeg"
    assert detail.fingerprint() == fingerprint


def test_parser_rejects_page_without_state() -> None:
    """确保缺少初始状态的页面给出明确异常。"""
    parser = InitialStateParser(AppSettings())

    with pytest.raises(ParseError, match="缺少作品初始状态"):
        parser.parse("<html></html>", URL)


@pytest.mark.parametrize(
    ("html", "message"),
    [
        ("", "作品页面为空"),
        ("<script>window.__INITIAL_STATE__=[]</script>", "不是对象"),
        ("<script>window.__INITIAL_STATE__={broken: [</script>", "无法解析"),
    ],
)
def test_parser_rejects_invalid_initial_state(html: str, message: str) -> None:
    """确保空页面和损坏状态均返回明确的解析异常。

    Args:
        html: 合成的无效页面。
        message: 预期异常信息。
    """
    parser = InitialStateParser(AppSettings())

    with pytest.raises(ParseError, match=message):
        parser.parse(html, URL)


def test_parser_supports_phone_state_and_missing_optional_fields() -> None:
    """确保移动端状态结构与缺失的可选字段可被稳健解析。"""
    note = {
        "noteId": WORK_ID,
        "type": "normal",
        "time": "invalid",
        "user": {"userId": "synthetic-author", "nickName": "移动端作者"},
        "imageList": [{"url": "https://sns-img-bd.xhscdn.com/synthetic-image"}],
        "tagList": [None, {"name": ""}, {"name": "合成标签"}],
    }
    parser = InitialStateParser(AppSettings())

    detail = parser.parse(
        make_initial_state_html(note, work_id=WORK_ID, phone_layout=True),
        URL,
    )

    assert detail.work_type is WorkType.IMAGE
    assert detail.author.nickname == "移动端作者"
    assert detail.author.avatar_url is None
    assert detail.published_at is None
    assert detail.updated_at is None
    assert detail.tags == ["合成标签"]


def test_parser_rejects_state_without_note() -> None:
    """确保初始状态缺少作品对象时返回领域异常。"""
    parser = InitialStateParser(AppSettings())

    with pytest.raises(ParseError, match="没有作品数据"):
        parser.parse(
            "<script>window.__INITIAL_STATE__={note: {}}</script>",
            URL,
        )
