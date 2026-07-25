"""Cookie HTTP 动态页面回退语义测试。"""

import json
from pathlib import Path

import httpx
import pytest
from xhs_adapters import HttpReadProvider
from xhs_adapters.config import AppSettings
from xhs_core.domain import ProviderError, ProviderFailureCode
from xhs_core.domain.browser_requests import SearchFilters


def _html(state: dict) -> str:
    script = json.dumps(state, ensure_ascii=False)
    return f"<script>window.__INITIAL_STATE__={script}</script>"


async def test_empty_static_search_requires_browser_fallback(tmp_path: Path) -> None:
    """确保动态搜索尚未水合时不把空列表伪装成有效结果。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """

    def handler(request: httpx.Request) -> httpx.Response:
        state = (
            {"user": {"userInfo": {"value": {"guest": False}}}}
            if request.url.path == "/explore/"
            else {
                "search": {
                    "keyword": {"value": "合成关键词"},
                    "feeds": {"value": []},
                }
            }
        )
        return httpx.Response(200, text=_html(state))

    provider = HttpReadProvider(
        AppSettings(work_path=tmp_path, cookie="session=synthetic", max_retry=0),
        transport=httpx.MockTransport(handler),
    )
    async with provider:
        with pytest.raises(ProviderError) as captured:
            await provider.search_feeds("合成关键词", SearchFilters())

    assert captured.value.code is ProviderFailureCode.UNSUPPORTED


async def test_guest_secondary_profile_is_not_misreported_as_expired(
    tmp_path: Path,
) -> None:
    """确保推荐页已登录后，二级页面访客态按页面不兼容处理。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/explore/":
            state = {
                "user": {
                    "userInfo": {
                        "value": {"guest": False, "userId": "synthetic-current"}
                    }
                }
            }
        else:
            state = {"user": {"userInfo": {"value": {"guest": True}}}}
        return httpx.Response(200, text=_html(state))

    provider = HttpReadProvider(
        AppSettings(work_path=tmp_path, cookie="session=synthetic", max_retry=0),
        transport=httpx.MockTransport(handler),
    )
    async with provider:
        with pytest.raises(ProviderError) as captured:
            await provider.get_user_profile("synthetic-user", "synthetic-token")

    assert captured.value.code is ProviderFailureCode.PAGE_INCOMPATIBLE
