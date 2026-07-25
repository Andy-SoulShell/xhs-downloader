"""严格解析受管发布点击后的页面观察结果。"""

import re
from enum import StrEnum
from typing import Any
from urllib.parse import urlsplit

from xhs_core.domain import (
    ManagedBrowserError,
    ManagedPublicationOutcome,
    PublicationTaskStatus,
)

from .managed_publication_contract import VERIFICATION_MESSAGE

_RESULT_PATH = re.compile(r"^/(?:explore|discovery/item)/[A-Za-z0-9]+/?$")


class ObservationState(StrEnum):
    """尚未形成终态的发布页面观察结果。"""

    PENDING = "pending"
    AWAITING_VERIFICATION = "awaiting_verification"


def parse_observation(
    value: Any,
) -> ManagedPublicationOutcome | ObservationState:
    """解析发布后的固定等待、验证或终态响应。

    Args:
        value: 页面适配器发布结果观察响应。

    Returns:
        尚待观察、等待验证或明确发布终态。

    Raises:
        ManagedBrowserError: 页面响应结构、消息或结果地址无效。
    """
    if value == {
        "ok": True,
        "state": "pending",
        "message": "等待创作平台确认",
    }:
        return ObservationState.PENDING
    if value == {
        "ok": True,
        "state": "awaiting_verification",
        "message": VERIFICATION_MESSAGE,
    }:
        return ObservationState.AWAITING_VERIFICATION
    if not isinstance(value, dict) or set(value) not in (
        {"ok", "state", "message"},
        {"ok", "state", "message", "resultUrl"},
    ):
        raise ManagedBrowserError("受管发布结果回读结构无效")
    state = value.get("state")
    message = value.get("message")
    if value.get("ok") is not True or state not in {"published", "failed"}:
        raise ManagedBrowserError("受管发布结果回读状态无效")
    expected_message = (
        "创作平台已确认发布成功" if state == "published" else "创作平台明确报告发布失败"
    )
    if message != expected_message:
        raise ManagedBrowserError("受管发布结果回读消息无效")
    result_url = _result_url(value.get("resultUrl"))
    if state == "failed" and result_url is not None:
        raise ManagedBrowserError("失败的受管发布响应不能包含作品地址")
    return ManagedPublicationOutcome(
        status=(
            PublicationTaskStatus.PUBLISHED
            if state == "published"
            else PublicationTaskStatus.FAILED
        ),
        message=expected_message,
        result_url=result_url,
    )


def _result_url(value: Any) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise ManagedBrowserError("受管发布结果地址类型无效")
    try:
        parsed = urlsplit(value)
    except ValueError as error:
        raise ManagedBrowserError("受管发布结果地址无效") from error
    if (
        parsed.scheme != "https"
        or parsed.netloc != "www.xiaohongshu.com"
        or parsed.query
        or parsed.fragment
        or not _RESULT_PATH.fullmatch(parsed.path)
    ):
        raise ManagedBrowserError("受管发布结果地址不受信任")
    return value
