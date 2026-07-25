"""HTTP 详情页初始状态解析测试。"""

import json
from typing import Any

import pytest
from xhs_adapters.parsing import FeedDetailStateParser
from xhs_core.domain import ProviderError, ProviderFailureCode, ProviderKind

FEED_ID = "synthetic-feed"


def _html(state: dict[str, Any], *, suffix: str = "") -> str:
    script = json.dumps(state, ensure_ascii=False)
    return f"<html><script>window.__INITIAL_STATE__={script};</script>{suffix}</html>"


def _note(**overrides: Any) -> dict[str, Any]:
    return {
        "noteId": FEED_ID,
        "xsecToken": "returned-token",
        "title": "合成详情",
        "desc": "仅用于自动化测试",
        "type": "normal",
        "time": 1_700_000_000_000,
        "ipLocation": "合成地点",
        "user": {
            "userId": "synthetic-author",
            "nickname": "合成作者",
            "avatar": "https://example.invalid/avatar.png",
        },
        "interactInfo": {
            "liked": True,
            "likedCount": 12,
            "collected": False,
            "collectedCount": "3",
            "commentCount": "2",
            "sharedCount": "1",
        },
        "imageList": [
            {"urlDefault": "https://example.invalid/image-1.png"},
            {
                "urlDefault": None,
                "urlPre": "https://example.invalid/image-2.png",
            },
            {"urlDefault": "file:///private/test.png"},
        ],
        **overrides,
    }


def _comment(comment_id: str, **overrides: Any) -> dict[str, Any]:
    return {
        "id": comment_id,
        "content": f"合成评论 {comment_id}",
        "liked": True,
        "likeCount": 2,
        "createTime": 1_700_000_000_001,
        "ipLocation": "合成地点",
        "subCommentCount": "2",
        "userInfo": {
            "userId": f"author-{comment_id}",
            "nickname": "评论作者",
        },
        **overrides,
    }


def _state(
    *,
    note: dict[str, Any] | None = None,
    comments: dict[str, Any] | None = None,
    key: str = FEED_ID,
) -> dict[str, Any]:
    return {
        "note": {
            "noteDetailMap": {
                key: {
                    "note": note or _note(),
                    "comments": {"value": comments or {"list": []}},
                }
            }
        }
    }


def test_parse_feed_detail_matches_extension_semantics() -> None:
    """确保正文、互动状态、媒体、评论和回复与扩展端语义一致。"""
    reply = _comment("reply-1", subCommentCount=None)
    comments = {
        "hasMore": True,
        "cursor": "synthetic-cursor",
        "list": [
            _comment(
                "comment-1",
                subComments={"_value": [reply, _comment("reply-2")]},
            ),
            {"id": "invalid-without-author"},
        ],
    }

    detail = FeedDetailStateParser().parse(
        _html(_state(comments=comments)),
        FEED_ID,
        "requested-token",
        comment_limit=10,
        include_replies=True,
        reply_limit=1,
    )

    assert detail.feed_id == FEED_ID
    assert detail.xsec_token == "returned-token"
    assert detail.title == "合成详情"
    assert detail.body == "仅用于自动化测试"
    assert detail.note_type == "image"
    assert detail.author.model_dump(mode="json") == {
        "user_id": "synthetic-author",
        "nickname": "合成作者",
        "avatar_url": "https://example.invalid/avatar.png",
    }
    assert detail.metrics.model_dump() == {
        "liked": True,
        "liked_count": "12",
        "collected": False,
        "collected_count": "3",
        "comment_count": "2",
        "shared_count": "1",
    }
    assert [str(url) for url in detail.image_urls] == [
        "https://example.invalid/image-1.png",
        "https://example.invalid/image-2.png",
    ]
    assert detail.published_at == 1_700_000_000_000
    assert detail.comments_has_more is True
    assert detail.comments_cursor == "synthetic-cursor"
    assert len(detail.comments) == 1
    assert detail.comments[0].like_count == "2"
    assert [item.comment_id for item in detail.comments[0].replies] == ["reply-1"]


def test_parser_applies_browser_limits_before_filtering() -> None:
    """确保评论限制作用于页面原始顺序，且关闭回复时不返回隐式数据。"""
    comments = {
        "list": [
            {"id": "invalid-without-author"},
            _comment("comment-2", subComments={"value": [_comment("reply-1")]}),
        ]
    }
    parser = FeedDetailStateParser()

    first = parser.parse(
        _html(_state(comments=comments)),
        FEED_ID,
        "requested-token",
        comment_limit=1,
        include_replies=True,
        reply_limit=10,
    )
    second = parser.parse(
        _html(_state(comments=comments)),
        FEED_ID,
        "requested-token",
        comment_limit=2,
        include_replies=False,
        reply_limit=10,
    )

    assert first.comments == []
    assert [item.comment_id for item in second.comments] == ["comment-2"]
    assert second.comments[0].replies == []
    assert second.comments[0].reply_count == "2"


def test_parser_uses_latest_parseable_state_and_normalizes_undefined() -> None:
    """确保残留坏脚本不会遮蔽有效状态，且 undefined 不污染字符串。"""
    valid = _html(_state()).replace(
        '"ipLocation": "合成地点"',
        '"ipLocation": undefined',
    )
    html = valid.replace(
        "</html>",
        "<script>window.__INITIAL_STATE__={broken</script></html>",
    )

    detail = FeedDetailStateParser().parse(
        html,
        FEED_ID,
        "requested-token",
        comment_limit=0,
        include_replies=False,
        reply_limit=0,
    )

    assert detail.ip_location == ""


def test_latest_parseable_non_object_does_not_revive_stale_state() -> None:
    """确保最新状态结构错误时不会悄悄复用旧详情。"""
    html = _html(
        _state(),
        suffix="<script>window.__INITIAL_STATE__=[]</script>",
    )

    with pytest.raises(ProviderError) as captured:
        FeedDetailStateParser().parse(
            html,
            FEED_ID,
            "requested-token",
            comment_limit=0,
            include_replies=False,
            reply_limit=0,
        )

    assert captured.value.code is ProviderFailureCode.PAGE_INCOMPATIBLE


def test_parser_finds_matching_note_under_nonmatching_map_key() -> None:
    """确保只有 noteId 严格匹配时才接受非直接映射项。"""
    detail = FeedDetailStateParser().parse(
        _html(_state(key="temporary-key")),
        FEED_ID,
        "requested-token",
        comment_limit=0,
        include_replies=False,
        reply_limit=0,
    )

    assert detail.feed_id == FEED_ID


@pytest.mark.parametrize(
    ("html", "expected"),
    [
        ("<html></html>", ProviderFailureCode.PAGE_INCOMPATIBLE),
        (
            _html({"noteData": {"data": {"noteData": _note()}}}),
            ProviderFailureCode.PAGE_INCOMPATIBLE,
        ),
        (
            _html(_state(note=_note(noteId="other-feed"))),
            ProviderFailureCode.INVALID_RESULT,
        ),
        (
            _html(_state(note=_note(user={}))),
            ProviderFailureCode.INVALID_RESULT,
        ),
        (
            _html(_state(note=_note(user={"userId": "x" * 129}))),
            ProviderFailureCode.INVALID_RESULT,
        ),
    ],
)
def test_parser_maps_incompatible_and_invalid_results(
    html: str,
    expected: ProviderFailureCode,
) -> None:
    """确保页面不兼容与目标数据错误使用不同稳定分类。

    Args:
        html: 合成页面。
        expected: 预期失败分类。
    """
    with pytest.raises(ProviderError) as captured:
        FeedDetailStateParser().parse(
            html,
            FEED_ID,
            "requested-token",
            comment_limit=0,
            include_replies=False,
            reply_limit=0,
        )

    assert captured.value.provider is ProviderKind.HTTP
    assert captured.value.code is expected
