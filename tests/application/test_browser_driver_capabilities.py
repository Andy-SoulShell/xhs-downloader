"""浏览器驱动能力预检测试。"""

import pytest
from xhs_adapters.sqlite import SqliteBrowserTaskRepository
from xhs_core.application import BrowserTaskService
from xhs_core.domain import (
    BrowserDriver,
    BrowserTaskError,
    BrowserTaskKind,
    browser_driver_supports,
)


def test_extension_implements_every_task_kind() -> None:
    """确保扩展驱动覆盖全部任务类型，受管驱动只覆盖已实现的部分。"""
    assert all(
        browser_driver_supports(BrowserDriver.EXTENSION, kind)
        for kind in BrowserTaskKind
    )

    unsupported = {
        kind
        for kind in BrowserTaskKind
        if not browser_driver_supports(BrowserDriver.MANAGED, kind)
    }

    assert BrowserTaskKind.POST_COMMENT in unsupported
    assert BrowserTaskKind.REPLY_COMMENT in unsupported
    assert BrowserTaskKind.SET_LIKE not in unsupported
    assert BrowserTaskKind.LIST_FEEDS not in unsupported


async def test_submission_rejects_tasks_the_driver_cannot_execute(
    tmp_path,
) -> None:
    """确保受管驱动不支持的任务在提交阶段就被拒绝且不入队。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    repository = SqliteBrowserTaskRepository(tmp_path.joinpath("state.db"))
    tasks = BrowserTaskService(repository)
    comment_payload = {
        "feed_id": "synthetic-feed",
        "xsec_token": "synthetic-token",
        "content": "合成评论",
    }

    with pytest.raises(BrowserTaskError, match="尚未支持"):
        await tasks.submit(
            BrowserTaskKind.POST_COMMENT,
            comment_payload,
            "synthetic-comment",
            BrowserDriver.MANAGED,
        )

    assert await repository.list_recent(10) == []
    # 失败的提交没有占用该请求标识: 改用扩展驱动仍可正常提交。
    accepted = await tasks.submit(
        BrowserTaskKind.POST_COMMENT,
        comment_payload,
        "synthetic-comment",
        BrowserDriver.EXTENSION,
    )

    assert accepted.target_driver is BrowserDriver.EXTENSION
    # 受管驱动已实现的互动任务不受影响。
    liked = await tasks.submit(
        BrowserTaskKind.SET_LIKE,
        {
            "feed_id": "synthetic-feed",
            "xsec_token": "synthetic-token",
            "active": True,
        },
        "synthetic-like",
        BrowserDriver.MANAGED,
    )

    assert liked.target_driver is BrowserDriver.MANAGED
