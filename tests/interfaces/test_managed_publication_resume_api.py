"""受管发布安全验证恢复 API 契约测试。"""

from datetime import UTC, datetime
from typing import cast

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from xhs_adapters.config import AppSettings
from xhs_api.app import create_api
from xhs_api.managed_publication import create_managed_publication_router
from xhs_api.settings import allow_loopback_settings
from xhs_core.application import (
    ManagedPublicationWorker,
    PublicationTaskService,
)
from xhs_core.domain import (
    BrowserDriver,
    PublicationMode,
    PublicationTask,
    PublicationTaskStatus,
)

from tests.helpers import make_publication_draft
from tests.interfaces.helpers import FakeService


class _Tasks:
    """返回可变合成发布任务。"""

    def __init__(self, task: PublicationTask) -> None:
        """保存当前任务。

        Args:
            task: 接口查询时返回的合成任务。
        """
        self.task = task
        self.calls: list[str] = []

    async def require(self, task_id: str) -> PublicationTask:
        """返回当前任务并记录查询。

        Args:
            task_id: 请求查询的任务标识。

        Returns:
            当前合成任务。
        """
        self.calls.append(task_id)
        return self.task


class _Worker:
    """按给定结果响应验证恢复请求。"""

    def __init__(self, results: list[bool]) -> None:
        """保存逐次恢复结果。

        Args:
            results: 每次调用依次返回的结果。
        """
        self.results = results
        self.calls: list[str] = []

    async def resume(self, task_id: str) -> bool:
        """记录并响应一次恢复请求。

        Args:
            task_id: 待恢复任务标识。

        Returns:
            当前预设恢复结果。
        """
        self.calls.append(task_id)
        return self.results.pop(0)


def _task(
    *,
    driver: BrowserDriver = BrowserDriver.MANAGED,
    status: PublicationTaskStatus = PublicationTaskStatus.AWAITING_VERIFICATION,
    attempted: bool = False,
) -> PublicationTask:
    draft = make_publication_draft()
    now = datetime.now(UTC)
    return PublicationTask(
        task_id="synthetic-task",
        package=draft,
        package_fingerprint=draft.fingerprint(),
        mode=PublicationMode.MANUAL,
        target_driver=driver,
        status=status,
        scheduled_at=now,
        publish_attempted=attempted,
        created_at=now,
        updated_at=now,
    )


def _api(tasks: _Tasks, worker: object) -> FastAPI:
    api = FastAPI()
    api.include_router(
        create_managed_publication_router(
            cast(PublicationTaskService, tasks),
            cast(ManagedPublicationWorker, worker),
            allow_loopback_settings,
        )
    )
    return api


@pytest.mark.parametrize("attempted", [False, True])
async def test_resume_requires_explicit_confirmation_and_reports_click_phase(
    attempted: bool,
) -> None:
    """确保显式确认只恢复精确任务并返回不可重试标记。

    Args:
        attempted: 是否已经进入发布点击阶段。
    """
    tasks = _Tasks(_task(attempted=attempted))
    worker = _Worker([True])
    async with AsyncClient(
        transport=ASGITransport(
            app=_api(tasks, worker),
            client=("127.0.0.1", 45000),
        ),
        base_url="http://127.0.0.1:5556",
    ) as client:
        response = await client.post(
            "/publication/tasks/synthetic-task/verification/resume",
            json={"confirmed": True},
        )

    assert response.status_code == 202
    assert response.json() == {
        "task_id": "synthetic-task",
        "resumed": True,
        "publish_attempted": attempted,
        "message": "已确认安全验证完成，受管发布将在原页面继续",
    }
    assert tasks.calls == ["synthetic-task"]
    assert worker.calls == ["synthetic-task"]


@pytest.mark.parametrize(
    "payload",
    [{}, {"confirmed": False}, {"confirmed": True, "x": 1}],
)
async def test_resume_rejects_missing_false_or_extra_confirmation(
    payload: dict[str, object],
) -> None:
    """确保请求体必须无歧义地确认继续。

    Args:
        payload: 待校验的合成请求体。
    """
    tasks = _Tasks(_task())
    worker = _Worker([True])
    async with AsyncClient(
        transport=ASGITransport(
            app=_api(tasks, worker),
            client=("127.0.0.1", 45000),
        ),
        base_url="http://127.0.0.1:5556",
    ) as client:
        response = await client.post(
            "/publication/tasks/synthetic-task/verification/resume",
            json=payload,
        )

    assert response.status_code == 422
    assert tasks.calls == []
    assert worker.calls == []


@pytest.mark.parametrize(
    ("client_host", "origin"),
    [
        ("198.51.100.8", None),
        ("127.0.0.1", "https://example.invalid"),
    ],
)
async def test_resume_rejects_remote_or_hostile_origin(
    client_host: str,
    origin: str | None,
) -> None:
    """确保非本机连接和外站来源都不能恢复页面。

    Args:
        client_host: 合成客户端地址。
        origin: 可选请求来源。
    """
    tasks = _Tasks(_task())
    worker = _Worker([True])
    headers = {"Origin": origin} if origin else {}
    async with AsyncClient(
        transport=ASGITransport(
            app=_api(tasks, worker),
            client=(client_host, 45000),
        ),
        base_url="http://127.0.0.1:5556",
    ) as client:
        response = await client.post(
            "/publication/tasks/synthetic-task/verification/resume",
            json={"confirmed": True},
            headers=headers,
        )

    assert response.status_code == 403
    assert tasks.calls == []
    assert worker.calls == []


@pytest.mark.parametrize(
    "task",
    [
        _task(driver=BrowserDriver.EXTENSION),
        _task(status=PublicationTaskStatus.PUBLISHING, attempted=True),
    ],
)
async def test_resume_rejects_wrong_driver_or_state(task: PublicationTask) -> None:
    """确保接口不能恢复扩展任务或非等待态任务。

    Args:
        task: 不符合恢复前置条件的合成任务。
    """
    tasks = _Tasks(task)
    worker = _Worker([True])
    async with AsyncClient(
        transport=ASGITransport(
            app=_api(tasks, worker),
            client=("127.0.0.1", 45000),
        ),
        base_url="http://127.0.0.1:5556",
    ) as client:
        response = await client.post(
            "/publication/tasks/synthetic-task/verification/resume",
            json={"confirmed": True},
        )

    assert response.status_code == 409
    assert worker.calls == []


async def test_resume_is_single_use_for_the_current_page() -> None:
    """确保相同页面的重复恢复请求不会再次生效。"""
    tasks = _Tasks(_task())
    worker = _Worker([True, False])
    async with AsyncClient(
        transport=ASGITransport(
            app=_api(tasks, worker),
            client=("127.0.0.1", 45000),
        ),
        base_url="http://127.0.0.1:5556",
    ) as client:
        first = await client.post(
            "/publication/tasks/synthetic-task/verification/resume",
            json={"confirmed": True},
        )
        duplicate = await client.post(
            "/publication/tasks/synthetic-task/verification/resume",
            json={"confirmed": True},
        )

    assert first.status_code == 202
    assert duplicate.status_code == 409
    assert worker.calls == ["synthetic-task", "synthetic-task"]


def test_main_api_exposes_managed_verification_resume(tmp_path) -> None:
    """确保生产 API 装配显式验证恢复端点。

    Args:
        tmp_path: Pytest 提供的临时工作目录。
    """
    api = create_api(AppSettings(work_path=tmp_path), lambda _: FakeService())

    assert "/publication/tasks/{task_id}/verification/resume" in api.openapi()["paths"]
