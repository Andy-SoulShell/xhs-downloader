"""浏览器任务输入和结果契约测试。"""

import pytest
from xhs_core.domain import BrowserTaskError, BrowserTaskKind
from xhs_core.domain.browser_requests import (
    validate_browser_task_payload,
    validate_browser_task_result,
)

QR_DATA = "data:image/png;base64,aGVsbG8="


def test_search_payload_is_normalized_with_explicit_defaults() -> None:
    """确保搜索输入在持久化前补全筛选默认值。"""
    payload = validate_browser_task_payload(
        BrowserTaskKind.SEARCH_FEEDS,
        {"keyword": "合成关键词"},
    )

    assert payload["filters"] == {
        "sort_by": "综合",
        "note_type": "不限",
        "publish_time": "不限",
        "search_scope": "不限",
        "location": "不限",
    }


def test_reply_requires_comment_or_user_target() -> None:
    """确保无回复目标的写任务无法进入队列。"""
    with pytest.raises(BrowserTaskError, match="参数无效"):
        validate_browser_task_payload(
            BrowserTaskKind.REPLY_COMMENT,
            {
                "feed_id": "synthetic-feed",
                "xsec_token": "synthetic-token",
                "content": "合成回复",
            },
        )


def test_feed_result_rejects_untrusted_extra_fields() -> None:
    """确保扩展结果必须符合对应的封闭结构。"""
    with pytest.raises(BrowserTaskError, match="结果结构无效"):
        validate_browser_task_result(
            BrowserTaskKind.LIST_FEEDS,
            {
                "source": "home",
                "keyword": None,
                "items": [],
                "cookie": "不允许的字段",
            },
        )


def test_login_session_contracts_require_qrcode_and_confirmation() -> None:
    """确保二维码只接受短期图片，Cookie 清理必须明确确认。"""
    result = validate_browser_task_result(
        BrowserTaskKind.GET_LOGIN_QRCODE,
        {
            "is_logged_in": False,
            "image_data_url": QR_DATA,
            "expires_at": "2026-08-01T12:04:00Z",
            "consumed": False,
        },
    )

    assert result["image_data_url"] == QR_DATA
    with pytest.raises(BrowserTaskError, match="参数无效"):
        validate_browser_task_payload(
            BrowserTaskKind.DELETE_COOKIES,
            {"confirmed": False},
        )
    with pytest.raises(BrowserTaskError, match="结果结构无效"):
        validate_browser_task_result(
            BrowserTaskKind.GET_LOGIN_QRCODE,
            {
                "is_logged_in": False,
                "image_data_url": "https://example.invalid/qr.png",
                "expires_at": "2026-08-01T12:04:00Z",
                "consumed": False,
            },
        )
