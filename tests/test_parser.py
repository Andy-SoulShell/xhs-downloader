"""合成作品页面解析测试。"""

import json

import pytest

from src.config import AppSettings
from src.domain import ParseError, WorkType
from src.infrastructure import InitialStateParser

WORK_ID = "synthetic000000000000000001"
URL = f"https://www.xiaohongshu.com/explore/{WORK_ID}"


def test_parser_builds_typed_video_detail() -> None:
    """确保合成视频页面被转换为完整领域模型。"""
    parser = InitialStateParser(AppSettings())
    detail = parser.parse(_synthetic_html(), URL)

    assert detail.work_id == WORK_ID
    assert detail.work_type is WorkType.VIDEO
    assert detail.author.nickname == "合成作者"
    assert detail.tags == ["公版测试"]
    assert detail.media[0].url.endswith("synthetic.mp4")
    assert len(detail.fingerprint()) == 64


def test_parser_rejects_page_without_state() -> None:
    """确保缺少初始状态的页面给出明确异常。"""
    parser = InitialStateParser(AppSettings())

    with pytest.raises(ParseError, match="缺少作品初始状态"):
        parser.parse("<html></html>", URL)


def _synthetic_html() -> str:
    note = {
        "noteId": WORK_ID,
        "title": "合成测试作品",
        "desc": "完全合成的测试文本",
        "type": "video",
        "time": 1_700_000_000_000,
        "lastUpdateTime": 1_700_000_100_000,
        "tagList": [{"name": "公版测试"}],
        "interactInfo": {
            "likedCount": "10",
            "collectedCount": "2",
            "commentCount": "1",
            "shareCount": "0",
        },
        "user": {"userId": "synthetic-author", "nickname": "合成作者"},
        "imageList": [{}],
        "video": {"consumer": {"originVideoKey": "synthetic.mp4"}},
    }
    state = {"note": {"noteDetailMap": {WORK_ID: {"note": note}}}}
    script = f"window.__INITIAL_STATE__={json.dumps(state, ensure_ascii=False)}"
    return f"<html><script>{script}</script></html>"
