"""浏览器只读 Provider 成功路径测试。"""

import asyncio

import pytest
from xhs_adapters.sqlite import SqliteBrowserTaskRepository
from xhs_core.application import (
    BrowserExecutionService,
    BrowserReadProvider,
    BrowserTaskService,
    CapabilityRouter,
)
from xhs_core.domain import (
    BrowserDriver,
    BrowserTask,
    BrowserTaskStatus,
    FeedDetailResult,
    FeedListResult,
    ProviderKind,
    RouteStrategy,
    UserProfileResult,
)


class _Ready:
    def __init__(self) -> None:
        self.calls: list[BrowserDriver] = []

    async def ensure_available(self, driver: BrowserDriver) -> None:
        self.calls.append(driver)


def _runtime(tmp_path, driver: BrowserDriver):
    repository = SqliteBrowserTaskRepository(tmp_path.joinpath("state.db"))
    tasks = BrowserTaskService(repository)
    execution = BrowserExecutionService(repository, lease_seconds=60)
    readiness = _Ready()
    provider = BrowserReadProvider(
        tasks,
        readiness,
        driver,
        timeout_seconds=1,
        poll_interval=0.001,
    )
    return repository, tasks, execution, readiness, provider


async def _complete_next(
    repository: SqliteBrowserTaskRepository,
    execution: BrowserExecutionService,
    driver: BrowserDriver,
    result: dict,
) -> BrowserTask:
    for _ in range(1000):
        if await repository.list_recent(1):
            break
        await asyncio.sleep(0)
    else:
        raise AssertionError("浏览器任务未在测试等待窗口内提交")
    other = (
        BrowserDriver.MANAGED
        if driver is BrowserDriver.EXTENSION
        else BrowserDriver.EXTENSION
    )
    assert await execution.claim("wrong-driver", other) is None
    for _ in range(1000):
        claim = await execution.claim(f"synthetic-{driver.value}", driver)
        if claim is not None:
            break
        await asyncio.sleep(0)
    else:
        raise AssertionError("浏览器任务未在测试等待窗口内进入队列")
    assert claim is not None
    await execution.update(
        claim.task.task_id,
        claim.lease_token,
        BrowserTaskStatus.RUNNING,
        "正在读取合成页面",
    )
    await execution.update(
        claim.task.task_id,
        claim.lease_token,
        BrowserTaskStatus.SUCCEEDED,
        "合成读取完成",
        result,
    )
    return claim.task


@pytest.mark.parametrize("driver", list(BrowserDriver))
async def test_list_feeds_uses_selected_driver_and_returns_model(
    tmp_path,
    driver: BrowserDriver,
) -> None:
    """确保推荐流固定交给调用方选择的驱动并返回领域模型。

    Args:
        tmp_path: Pytest 提供的临时目录。
        driver: 参数化的扩展或受管浏览器驱动。
    """
    repository, _, execution, readiness, provider = _runtime(tmp_path, driver)
    completion = asyncio.create_task(
        _complete_next(
            repository,
            execution,
            driver,
            {
                "items": [],
                "source": "home",
                "keyword": None,
                "has_more": False,
                "cursor": "",
            },
        )
    )

    routed = await CapabilityRouter().execute_read(
        RouteStrategy.BROWSER_ONLY,
        browser=lambda: provider.list_feeds("synthetic-list-request"),
    )
    claimed = await completion

    result = routed.value
    assert isinstance(result, FeedListResult)
    assert result.source == "home"
    assert routed.provider is ProviderKind.BROWSER
    assert claimed.target_driver is driver
    assert readiness.calls == [driver]


async def test_search_feeds_preserves_keyword_and_filters(tmp_path) -> None:
    """确保搜索任务冻结默认筛选并严格返回同一关键词。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    repository, _, execution, _, provider = _runtime(
        tmp_path,
        BrowserDriver.MANAGED,
    )
    completion = asyncio.create_task(
        _complete_next(
            repository,
            execution,
            BrowserDriver.MANAGED,
            {
                "items": [],
                "source": "search",
                "keyword": "合成关键词",
                "has_more": False,
                "cursor": "",
            },
        )
    )

    result = await provider.search_feeds(
        "合成关键词",
        request_id="synthetic-search-request",
    )
    claimed = await completion

    assert result.keyword == "合成关键词"
    assert claimed.payload["keyword"] == "合成关键词"
    assert claimed.payload["filters"]["sort_by"] == "综合"


async def test_feed_detail_returns_only_requested_feed(tmp_path) -> None:
    """确保帖子详情通过结构和帖子标识双重校验。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    repository, _, execution, _, provider = _runtime(
        tmp_path,
        BrowserDriver.EXTENSION,
    )
    completion = asyncio.create_task(
        _complete_next(
            repository,
            execution,
            BrowserDriver.EXTENSION,
            {
                "feed_id": "synthetic-feed",
                "xsec_token": "synthetic-token",
                "author": {"user_id": "synthetic-author"},
            },
        )
    )

    result = await provider.get_feed_detail(
        "synthetic-feed",
        "synthetic-token",
        request_id="synthetic-detail-request",
    )
    await completion

    assert isinstance(result, FeedDetailResult)
    assert result.feed_id == "synthetic-feed"
    assert result.author.user_id == "synthetic-author"


async def test_requested_and_current_profiles_return_models(tmp_path) -> None:
    """确保指定用户和当前账号主页都返回可信领域模型。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    repository, _, execution, _, provider = _runtime(
        tmp_path,
        BrowserDriver.MANAGED,
    )
    requested_completion = asyncio.create_task(
        _complete_next(
            repository,
            execution,
            BrowserDriver.MANAGED,
            {"user_id": "synthetic-user"},
        )
    )
    requested = await provider.get_user_profile(
        "synthetic-user",
        "synthetic-token",
        "synthetic-profile-request",
    )
    await requested_completion
    current_completion = asyncio.create_task(
        _complete_next(
            repository,
            execution,
            BrowserDriver.MANAGED,
            {"user_id": "synthetic-current-user"},
        )
    )
    current = await provider.get_my_profile("synthetic-current-request")
    await current_completion

    assert isinstance(requested, UserProfileResult)
    assert requested.user_id == "synthetic-user"
    assert current.user_id == "synthetic-current-user"
