"""Chromium 子进程与 CDP 端点基础能力。"""

import asyncio
from collections.abc import Awaitable, Callable, Sequence
from pathlib import Path
from typing import Protocol

from httpx import AsyncClient, HTTPError

CDP_HOST = "127.0.0.1"
START_PAGE = "https://www.xiaohongshu.com/explore"


class ChromiumProcess(Protocol):
    """生命周期控制器依赖的最小子进程接口。"""

    pid: int
    returncode: int | None

    async def wait(self) -> int:
        """等待进程退出。

        Returns:
            子进程退出码。
        """
        ...

    def terminate(self) -> None:
        """请求进程正常退出。"""
        ...

    def kill(self) -> None:
        """强制终止进程。"""
        ...


ProcessLauncher = Callable[[Sequence[str]], Awaitable[ChromiumProcess]]
EndpointProbe = Callable[[int], Awaitable[bool]]


# 挪出可视区用的坐标。给一个远超任何屏幕排布的负值, 让窗口管理器把它钳到
# 主屏左侧之外; 实测 macOS 会钳成 -(主屏宽度), 窗口整扇落在屏幕外。
_OFFSCREEN_POSITION = "--window-position=-32000,-32000"


def build_launch_command(
    executable: Path,
    profile_dir: Path,
    headless: bool,
    offscreen: bool = False,
) -> tuple[str, ...]:
    """构造限定专用目录和回环 CDP 的 Chromium 命令。

    Args:
        executable: 已检测的浏览器可执行文件。
        profile_dir: 与日常浏览器隔离的用户目录。
        headless: 是否隐藏浏览器窗口。
        offscreen: 是否把窗口挪到可视区之外；无头时该项没有意义。

    Returns:
        不包含 Cookie 或页面凭据的启动参数。
    """
    args = [
        str(executable),
        f"--user-data-dir={profile_dir}",
        f"--remote-debugging-address={CDP_HOST}",
        "--remote-debugging-port=0",
        "--no-first-run",
        "--no-default-browser-check",
    ]
    if headless:
        args.append("--headless=new")
    elif offscreen:
        args.append(_OFFSCREEN_POSITION)
    args.append(START_PAGE)
    return tuple(args)


async def launch_process(command: Sequence[str]) -> ChromiumProcess:
    """启动 Chromium 子进程并丢弃原始标准输出。

    Args:
        command: 已验证的可执行文件和启动参数。

    Returns:
        可等待和终止的子进程句柄。
    """
    return await asyncio.create_subprocess_exec(
        *command,
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.DEVNULL,
    )


async def probe_endpoint(port: int) -> bool:
    """检查固定回环地址上的 CDP 版本端点。

    Args:
        port: Chromium 自行分配的本机端口。

    Returns:
        端点返回 HTTP 200 时为真。
    """
    try:
        async with AsyncClient(timeout=1, trust_env=False) as client:
            response = await client.get(f"http://{CDP_HOST}:{port}/json/version")
        return response.status_code == 200
    except HTTPError:
        return False


def read_active_port(path: Path) -> int | None:
    """读取 Chromium 写入用户目录的活动 CDP 端口。

    Args:
        path: ``DevToolsActivePort`` 文件路径。

    Returns:
        合法端口；文件尚未生成或内容无效时返回 ``None``。
    """
    try:
        first_line = path.read_text("utf-8").splitlines()[0]
        port = int(first_line)
    except (OSError, ValueError, IndexError):
        return None
    return port if 1 <= port <= 65535 else None
