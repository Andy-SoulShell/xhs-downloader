"""受管发布生产 Factory 与 Bootstrap 装配测试。"""

from pathlib import Path
from typing import Any

import pytest
import xhs_adapters.factory as factory_module
from xhs_adapters.config import AppSettings
from xhs_api.bootstrap import create_api_dependencies
from xhs_core.domain import ManagedBrowserState, ManagedBrowserStatus


class _Controller:
    """提供未启动的合成受管浏览器控制器。"""

    async def status(self) -> ManagedBrowserStatus:
        """返回当前进程持有的停止状态。

        Returns:
            合成受管浏览器状态。
        """
        return ManagedBrowserStatus(
            installed=True,
            state=ManagedBrowserState.STOPPED,
            executable_name="synthetic-chromium",
        )

    async def start(self) -> ManagedBrowserStatus:
        """返回合成运行状态。

        Returns:
            当前进程持有的合成运行状态。
        """
        return ManagedBrowserStatus(
            installed=True,
            state=ManagedBrowserState.RUNNING,
            executable_name="synthetic-chromium",
            cdp_port=19222,
            owned_by_current_process=True,
        )

    async def stop(self) -> ManagedBrowserStatus:
        """返回合成停止状态。

        Returns:
            已停止的合成状态。
        """
        return await self.status()

    async def close(self) -> None:
        """完成无资源的合成关闭。"""


class _PublicationExecutor:
    """记录 Factory 传入的受管浏览器控制器。"""

    def __init__(self, controller: _Controller) -> None:
        """保存执行器共享的控制器。

        Args:
            controller: Factory 提供的受管控制器。
        """
        self.controller = controller


class _PublicationWorker:
    """记录生产 Worker 的四项关键共享依赖。"""

    def __init__(
        self,
        controller: _Controller,
        execution: Any,
        executor: _PublicationExecutor,
        execution_gate: Any,
    ) -> None:
        """保存 Factory 装配结果。

        Args:
            controller: 与通用 Worker 共享的控制器。
            execution: PublicationRuntime 暴露的执行用例。
            executor: 页面发布执行器。
            execution_gate: 与通用 Worker 共享的独占闸门。
        """
        self.controller = controller
        self.execution = execution
        self.executor = executor
        self.execution_gate = execution_gate


def test_bootstrap_reuses_managed_controller_gate_and_execution(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """确保生产装配不会创建第二个 Profile、闸门或执行用例。

    Args:
        tmp_path: Pytest 提供的临时目录。
        monkeypatch: Pytest 属性替换工具。
    """
    controller = _Controller()
    monkeypatch.setattr(factory_module, "ChromiumController", lambda _: controller)
    monkeypatch.setattr(
        factory_module,
        "PlaywrightManagedPublicationExecutor",
        _PublicationExecutor,
    )
    monkeypatch.setattr(
        factory_module,
        "ManagedPublicationWorker",
        _PublicationWorker,
    )

    dependencies = create_api_dependencies(
        AppSettings(work_path=tmp_path),
        tmp_path.joinpath(".env"),
    )

    worker = dependencies.publication.worker
    assert worker.controller is dependencies.browser.managed
    assert worker.execution is dependencies.publication.execution
    assert worker.executor.controller is dependencies.browser.managed
    assert worker.execution_gate is dependencies.browser.execution_gate
    assert (
        dependencies.browser.worker._execution_gate
        is dependencies.browser.execution_gate
    )
