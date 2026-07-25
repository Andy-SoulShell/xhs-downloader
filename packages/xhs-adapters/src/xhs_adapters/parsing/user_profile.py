"""Cookie HTTP 用户主页初始状态解析器。"""

from typing import Any

from pydantic import ValidationError
from xhs_core.domain import (
    ProfileMetric,
    ProviderError,
    ProviderFailureCode,
    ProviderKind,
    UserProfileResult,
)

from ._feed_data import (
    contains_feed_candidate,
    parse_feed_summaries,
    record,
    text,
    unwrap,
    url,
)
from ._initial_state import load_latest_initial_state


class UserProfileStateParser:
    """把指定用户主页状态转换为统一资料模型。"""

    def parse(self, html: str, expected_user_id: str) -> UserProfileResult:
        """解析并核对指定用户的主页资料和 Feed。

        Args:
            html: 小红书用户主页 HTML。
            expected_user_id: 请求路径中的目标用户 ID。

        Returns:
            目标身份已严格核对的用户主页。

        Raises:
            ProviderError: 页面状态缺失、目标身份不符或结果结构无效。
        """
        state = load_latest_initial_state(html)
        if state is None:
            raise _page_incompatible("HTTP 用户主页没有可解析的初始状态")
        user = record(state.get("user"))
        if "userPageData" not in user or "notes" not in user:
            raise _page_incompatible("HTTP 用户主页资料尚未加载")
        page_data = unwrap(user.get("userPageData"))
        notes = unwrap(user.get("notes"))
        if not isinstance(page_data, dict) or not isinstance(notes, list):
            raise _invalid_result("HTTP 用户主页状态结构无效")
        basic = record(page_data.get("basicInfo"))
        if not basic:
            raise _page_incompatible("HTTP 用户主页基本资料尚未加载")
        actual_user_id = text(basic.get("userId", basic.get("user_id")))
        if not actual_user_id or actual_user_id != expected_user_id:
            raise _invalid_result("HTTP 用户主页与请求的用户不一致")
        interactions = page_data.get("interactions", [])
        if not isinstance(interactions, list):
            raise _invalid_result("HTTP 用户主页统计结构无效")
        feeds = parse_feed_summaries(notes, limit=500)
        if contains_feed_candidate(notes) and not feeds:
            raise _invalid_result("HTTP 用户主页没有有效帖子")
        try:
            return UserProfileResult(
                user_id=actual_user_id,
                nickname=text(basic.get("nickname"))[:200],
                red_id=text(basic.get("redId"))[:200],
                description=text(basic.get("desc"))[:5000],
                avatar_url=url(basic.get("imageb", basic.get("images"))),
                ip_location=text(basic.get("ipLocation"))[:200],
                metrics=_parse_metrics(interactions),
                feeds=feeds,
            )
        except ValidationError:
            raise _invalid_result("HTTP 用户主页结果结构无效") from None


def _parse_metrics(values: list[Any]) -> list[ProfileMetric]:
    metrics: list[ProfileMetric] = []
    for value in values:
        metric = record(value)
        name = text(metric.get("name"))
        if not name:
            continue
        metrics.append(
            ProfileMetric(
                name=name[:100],
                count=(text(metric.get("count")) or "0")[:100],
                metric_type=text(metric.get("type"))[:100],
            )
        )
        if len(metrics) >= 20:
            break
    return metrics


def _page_incompatible(message: str) -> ProviderError:
    return ProviderError(
        ProviderKind.HTTP,
        ProviderFailureCode.PAGE_INCOMPATIBLE,
        message,
    )


def _invalid_result(message: str) -> ProviderError:
    return ProviderError(
        ProviderKind.HTTP,
        ProviderFailureCode.INVALID_RESULT,
        message,
    )
