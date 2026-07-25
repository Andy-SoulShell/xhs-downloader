"""编排受管创作页上传、填充、点击和同页验证恢复。"""

import asyncio
from collections.abc import Callable
from contextlib import suppress
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal, cast
from urllib.parse import urlsplit

from xhs_core.domain import (
    ManagedBrowserError,
    ManagedBrowserState,
    ManagedPublicationOutcome,
    ManagedPublicationProgress,
    ManagedPublicationProgressReporter,
    PublicationTask,
    PublicationTaskStatus,
)
from xhs_core.domain.browser_ports import ManagedBrowserController

from .managed_page_session import ManagedPageSession, ManagedPageSessionFactory
from .managed_publication_assets import verify_publication_asset_contents
from .managed_publication_click import click_prepared_publish
from .managed_publication_contract import (
    ADAPTER_VERSION_EXPRESSION,
    FILL_EXPRESSION,
    OBSERVE_EXPRESSION,
    PREPARE_PUBLISH_EXPRESSION,
    PREPARE_UPLOAD_EXPRESSION,
    VERIFY_SCHEDULE_EXPRESSION,
    ScheduleInput,
    is_verification_response,
    publication_page_url,
    validate_creator_page,
    validate_fill_response,
    validate_publish_response,
    validate_schedule_response,
    validate_upload_response,
)
from .managed_publication_observation import ObservationState, parse_observation
from .managed_publication_page import ManagedPublicationPage
from .managed_publisher_assets import load_managed_publisher_adapter

_NAVIGATION_TIMEOUT_MILLISECONDS = 30_000
_INPUT_TIMEOUT_MILLISECONDS = 30_000


@dataclass
class _ActiveExecution:
    task_id: str
    runner: asyncio.Task[Any]
    resume_event: asyncio.Event = field(default_factory=asyncio.Event)
    session: ManagedPageSession | None = None
    page: ManagedPublicationPage | None = None
    waiting: bool = False
    publish_attempted: bool = False


class _ManagedPublicationFlow:
    """保存页面流程依赖并执行单一受管发布任务。"""

    def __init__(
        self,
        controller: ManagedBrowserController,
        session_factory: ManagedPageSessionFactory,
        *,
        observation_timeout: float,
        poll_interval: float,
        is_closed: Callable[[], bool],
    ) -> None:
        self._controller = controller
        self._session_factory = session_factory
        self._observation_timeout = observation_timeout
        self._poll_interval = poll_interval
        self._is_closed = is_closed

    async def _run(
        self,
        active: _ActiveExecution,
        task: PublicationTask,
        paths: tuple[Path, ...],
        media_kind: Literal["image", "video"],
        report: ManagedPublicationProgressReporter,
    ) -> ManagedPublicationOutcome:
        status = await self._controller.status()
        if status.state is not ManagedBrowserState.RUNNING or status.cdp_port is None:
            raise ManagedBrowserError("受管浏览器尚未运行")
        session = self._session_factory()
        active.session = session
        await session.connect(status.cdp_port)
        page = cast(ManagedPublicationPage, await session.new_page())
        active.page = page
        await page.add_init_script(load_managed_publisher_adapter())
        await page.goto(
            publication_page_url(media_kind),
            wait_until="domcontentloaded",
            timeout=_NAVIGATION_TIMEOUT_MILLISECONDS,
        )
        validate_creator_page(page.url)
        if await page.evaluate(ADAPTER_VERSION_EXPRESSION) != "1":
            raise ManagedBrowserError("受管发布页面适配器版本无效")
        payload = task.model_dump(mode="json")
        upload = await self._step(
            active,
            PREPARE_UPLOAD_EXPRESSION,
            payload,
            report,
        )
        validate_upload_response(upload, media_kind)
        validate_creator_page(page.url)
        await verify_publication_asset_contents(task, paths)
        await page.set_input_files(
            "[data-xhd-managed-upload='true']",
            [str(path) for path in paths],
            strict=True,
            timeout=_INPUT_TIMEOUT_MILLISECONDS,
        )
        filled = await self._step(active, FILL_EXPRESSION, payload, report)
        schedule = validate_fill_response(filled, task)
        if schedule:
            await self._type_schedule(active, schedule)
            verified = await self._step(
                active,
                VERIFY_SCHEDULE_EXPRESSION,
                None,
                report,
            )
            validate_schedule_response(verified)
        await page.bring_to_front()
        await self._require_pending(active, report)
        prepared = await self._step(
            active,
            PREPARE_PUBLISH_EXPRESSION,
            None,
            report,
        )
        click = validate_publish_response(prepared)
        validate_creator_page(page.url)
        await report(
            ManagedPublicationProgress(
                status=PublicationTaskStatus.PUBLISHING,
                message="即将通过受管浏览器可信输入提交发布",
                publish_attempted=True,
            )
        )
        active.publish_attempted = True
        validate_creator_page(page.url)
        await click_prepared_publish(page, click, session)
        return await self._observe(active, report)

    async def _cleanup(self, active: _ActiveExecution) -> None:
        if active.page:
            with suppress(Exception, asyncio.CancelledError):
                await active.page.close()
        if active.session:
            with suppress(Exception, asyncio.CancelledError):
                await active.session.close()

    async def _step(
        self,
        active: _ActiveExecution,
        expression: str,
        argument: Any,
        report: ManagedPublicationProgressReporter,
    ) -> Any:
        page = _require_page(active)
        while True:
            validate_creator_page(page.url)
            response = (
                await page.evaluate(expression)
                if argument is None
                else await page.evaluate(expression, argument)
            )
            if not is_verification_response(response):
                return response
            await self._wait_for_verification(active, report)

    async def _type_schedule(
        self,
        active: _ActiveExecution,
        schedule: ScheduleInput,
    ) -> None:
        page = _require_page(active)
        validate_creator_page(page.url)
        await page.bring_to_front()
        await page.click(
            schedule.selector,
            strict=True,
            timeout=_INPUT_TIMEOUT_MILLISECONDS,
        )
        await page.keyboard.press("ControlOrMeta+A")
        await page.keyboard.insert_text(schedule.value)
        await page.keyboard.press("Tab")

    async def _require_pending(
        self,
        active: _ActiveExecution,
        report: ManagedPublicationProgressReporter,
    ) -> None:
        page = _require_page(active)
        while True:
            validate_creator_page(page.url)
            response = await page.evaluate(OBSERVE_EXPRESSION)
            parsed = parse_observation(response)
            if parsed is ObservationState.PENDING:
                return
            if parsed is ObservationState.AWAITING_VERIFICATION:
                await self._wait_for_verification(active, report)
                continue
            raise ManagedBrowserError("创作页存在与当前任务无关的发布终态")

    async def _observe(
        self,
        active: _ActiveExecution,
        report: ManagedPublicationProgressReporter,
    ) -> ManagedPublicationOutcome:
        loop = asyncio.get_running_loop()
        deadline = loop.time() + self._observation_timeout
        while loop.time() < deadline:
            page = _require_page(active)
            _validate_observation_page(page.url)
            parsed = parse_observation(await page.evaluate(OBSERVE_EXPRESSION))
            if isinstance(parsed, ManagedPublicationOutcome):
                return parsed
            if parsed is ObservationState.AWAITING_VERIFICATION:
                await self._wait_for_verification(active, report)
                deadline = loop.time() + self._observation_timeout
                continue
            await asyncio.sleep(self._poll_interval)
        return ManagedPublicationOutcome(
            status=PublicationTaskStatus.NEEDS_REVIEW,
            message="创作平台未在限定时间内确认发布结果，需要人工核对",
        )

    async def _wait_for_verification(
        self,
        active: _ActiveExecution,
        report: ManagedPublicationProgressReporter,
    ) -> None:
        page = _require_page(active)
        active.resume_event.clear()
        active.waiting = True
        attempted = active.publish_attempted
        phase = (
            PublicationTaskStatus.PUBLISHING
            if attempted
            else PublicationTaskStatus.FILLING
        )
        try:
            await page.bring_to_front()
            await report(
                ManagedPublicationProgress(
                    status=PublicationTaskStatus.AWAITING_VERIFICATION,
                    message="创作平台要求安全验证，完成后请显式继续",
                    publish_attempted=attempted,
                )
            )
            await active.resume_event.wait()
            if self._is_closed():
                raise asyncio.CancelledError
            await report(
                ManagedPublicationProgress(
                    status=phase,
                    message="安全验证已完成，继续原发布任务",
                    publish_attempted=attempted,
                )
            )
        finally:
            active.waiting = False


def _require_page(active: _ActiveExecution) -> ManagedPublicationPage:
    if active.page is None:
        raise ManagedBrowserError("受管发布页面尚未创建")
    return active.page


def _validate_observation_page(url: str) -> None:
    try:
        parsed = urlsplit(url)
    except ValueError as error:
        raise ManagedBrowserError("受管发布观察页面地址无效") from error
    if parsed.scheme != "https" or parsed.netloc not in {
        "creator.xiaohongshu.com",
        "www.xiaohongshu.com",
    }:
        raise ManagedBrowserError("发布点击后页面离开小红书，需要人工核对")
