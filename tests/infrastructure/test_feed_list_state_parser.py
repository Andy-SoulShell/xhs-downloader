"""HTTP Feed 列表初始状态解析测试。"""

import json

import pytest
from xhs_adapters.parsing.feed_list import FeedListStateParser
from xhs_core.domain import ProviderError, ProviderFailureCode


def _feed(index: int = 1, *, valid: bool = True) -> dict:
    return {
        "id": f"synthetic-feed-{index}" if valid else "",
        "xsecToken": f"synthetic-token-{index}",
        "noteCard": {
            "type": "video",
            "displayTitle": "合成 Feed",
            "user": {
                "userId": "synthetic-author",
                "nickname": "合成作者",
            },
            "interactInfo": {
                "liked": True,
                "likedCount": "12",
                "collectedCount": "3",
            },
            "cover": {
                "urlDefault": "https://example.invalid/cover.png",
                "width": 640,
                "height": 480,
            },
            "video": {"capa": {"duration": 9}},
        },
    }


def _html(state: dict) -> str:
    script = json.dumps(state, ensure_ascii=False)
    return f"<script>window.__INITIAL_STATE__={script}</script>"


@pytest.mark.parametrize("wrapper", ["value", "_value"])
def test_parse_home_supports_both_state_wrappers(wrapper: str) -> None:
    """确保推荐流兼容两种响应式包装并忠实转换字段。

    Args:
        wrapper: 合成状态采用的包装字段。
    """
    state = {
        "feed": {
            "feeds": {wrapper: [[_feed()]]},
            "hasMore": True,
            "cursor": "synthetic-cursor",
        }
    }

    result = FeedListStateParser().parse(_html(state), "home")

    assert result.source == "home"
    assert result.keyword is None
    assert result.has_more is True
    assert result.cursor == "synthetic-cursor"
    assert len(result.items) == 1
    item = result.items[0]
    assert item.feed_id == "synthetic-feed-1"
    assert item.note_type == "video"
    assert item.author.user_id == "synthetic-author"
    assert item.metrics.liked is True
    assert item.cover_width == 640
    assert item.video_duration == 9


def test_parse_search_validates_explicit_keyword_and_sanitizes_url() -> None:
    """确保页面声明关键词时必须匹配，且无效媒体地址不会穿透。"""
    feed = _feed()
    feed["noteCard"]["cover"]["urlDefault"] = "javascript:alert(1)"
    state = {
        "search": {
            "keyword": {"_value": "合成关键词"},
            "feeds": {"value": [feed]},
        }
    }

    result = FeedListStateParser().parse(
        _html(state),
        "search",
        keyword="合成关键词",
    )

    assert result.keyword == "合成关键词"
    assert result.items[0].cover_url is None
    with pytest.raises(ProviderError) as captured:
        FeedListStateParser().parse(
            _html(state),
            "search",
            keyword="其他关键词",
        )
    assert captured.value.code is ProviderFailureCode.INVALID_RESULT


@pytest.mark.parametrize("source", ["home", "search"])
def test_valid_empty_list_is_success(source: str) -> None:
    """确保合法空结果不会被误判为解析失败。

    Args:
        source: 合成推荐或搜索来源。
    """
    state = {
        "feed" if source == "home" else "search": {
            "feeds": {"value": []},
        }
    }

    result = FeedListStateParser().parse(
        _html(state),
        source,
        keyword="合成关键词" if source == "search" else None,
    )

    assert result.items == []


def test_list_is_bounded_to_domain_limit() -> None:
    """确保超长页面状态最多产生 200 条摘要。"""
    state = {
        "feed": {
            "feeds": {"value": [_feed(index) for index in range(205)]},
        }
    }

    result = FeedListStateParser().parse(_html(state), "home")

    assert len(result.items) == 200
    assert result.items[-1].feed_id == "synthetic-feed-199"


@pytest.mark.parametrize(
    ("state", "code"),
    [
        ({}, ProviderFailureCode.PAGE_INCOMPATIBLE),
        ({"feed": {}}, ProviderFailureCode.PAGE_INCOMPATIBLE),
        (
            {"feed": {"feeds": {"value": {}}}},
            ProviderFailureCode.INVALID_RESULT,
        ),
        (
            {"feed": {"feeds": {"value": [_feed(valid=False)]}}},
            ProviderFailureCode.INVALID_RESULT,
        ),
    ],
)
def test_invalid_state_has_stable_failure(
    state: dict,
    code: ProviderFailureCode,
) -> None:
    """确保缺失状态与畸形结果采用不同稳定分类。

    Args:
        state: 合成初始状态。
        code: 预期失败分类。
    """
    with pytest.raises(ProviderError) as captured:
        FeedListStateParser().parse(_html(state), "home")

    assert captured.value.code is code
