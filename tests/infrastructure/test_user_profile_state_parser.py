"""HTTP 用户主页初始状态解析测试。"""

import json

import pytest
from xhs_adapters.parsing.user_profile import UserProfileStateParser
from xhs_core.domain import ProviderError, ProviderFailureCode


def _feed() -> dict:
    return {
        "id": "synthetic-feed",
        "noteCard": {
            "type": "normal",
            "displayTitle": "合成帖子",
            "user": {"userId": "synthetic-user"},
        },
    }


def _state(
    *,
    wrapper: str = "value",
    user_id: str | None = "synthetic-user",
    notes: object | None = None,
) -> dict:
    basic = {
        "nickname": "合成用户",
        "redId": "synthetic-red",
        "desc": "合成简介",
        "imageb": "https://example.invalid/avatar.png",
        "ipLocation": "合成地点",
    }
    if user_id is not None:
        basic["userId"] = user_id
    return {
        "user": {
            "userPageData": {
                wrapper: {
                    "basicInfo": basic,
                    "interactions": [
                        {"name": "关注", "count": "8", "type": "follows"},
                        {"name": ""},
                    ],
                }
            },
            "notes": {wrapper: [[_feed()]] if notes is None else notes},
        }
    }


def _html(state: dict) -> str:
    script = json.dumps(state, ensure_ascii=False)
    return f"<script>window.__INITIAL_STATE__={script}</script>"


@pytest.mark.parametrize("wrapper", ["value", "_value"])
def test_parse_profile_supports_wrappers_and_nested_feeds(wrapper: str) -> None:
    """确保主页状态兼容两种包装并展平帖子。

    Args:
        wrapper: 合成状态采用的包装字段。
    """
    result = UserProfileStateParser().parse(
        _html(_state(wrapper=wrapper)),
        "synthetic-user",
    )

    assert result.user_id == "synthetic-user"
    assert result.nickname == "合成用户"
    assert result.red_id == "synthetic-red"
    assert str(result.avatar_url) == "https://example.invalid/avatar.png"
    assert [metric.name for metric in result.metrics] == ["关注"]
    assert [feed.feed_id for feed in result.feeds] == ["synthetic-feed"]


@pytest.mark.parametrize("notes", [[], [None, []]])
def test_profile_accepts_explicit_empty_notes(notes: list) -> None:
    """确保已加载的空帖子列表和空占位是合法主页结果。

    Args:
        notes: 合成的空帖子状态。
    """
    result = UserProfileStateParser().parse(
        _html(_state(notes=notes)),
        "synthetic-user",
    )

    assert result.feeds == []


@pytest.mark.parametrize("actual", [None, "other-user"])
def test_profile_requires_exact_target_identity(actual: str | None) -> None:
    """确保缺失或不一致的页面身份不能冒充请求用户。

    Args:
        actual: 页面返回的合成用户 ID。
    """
    with pytest.raises(ProviderError) as captured:
        UserProfileStateParser().parse(
            _html(_state(user_id=actual)),
            "synthetic-user",
        )

    assert captured.value.code is ProviderFailureCode.INVALID_RESULT


@pytest.mark.parametrize(
    ("state", "code"),
    [
        ({}, ProviderFailureCode.PAGE_INCOMPATIBLE),
        (
            {"user": {"userPageData": {"value": {}}, "notes": {"value": []}}},
            ProviderFailureCode.PAGE_INCOMPATIBLE,
        ),
        (
            {
                "user": {
                    "userPageData": {"value": {"basicInfo": {"userId": "u"}}},
                    "notes": {"value": {}},
                }
            },
            ProviderFailureCode.INVALID_RESULT,
        ),
        (
            _state(notes=[{"not": "a-feed"}]),
            ProviderFailureCode.INVALID_RESULT,
        ),
    ],
)
def test_invalid_profile_state_has_stable_failure(
    state: dict,
    code: ProviderFailureCode,
) -> None:
    """确保未加载资料与畸形结构采用不同失败分类。

    Args:
        state: 合成初始状态。
        code: 预期失败分类。
    """
    with pytest.raises(ProviderError) as captured:
        UserProfileStateParser().parse(_html(state), "synthetic-user")

    assert captured.value.code is code
