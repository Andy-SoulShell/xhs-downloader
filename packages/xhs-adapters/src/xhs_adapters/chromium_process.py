"""Chromium 子进程与 CDP 端点基础能力。"""

import asyncio
import re
import sys
from collections.abc import Awaitable, Callable, Sequence
from pathlib import Path
from typing import Protocol

from httpx import AsyncClient, HTTPError
from loguru import logger

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


# 无头时 Chrome 会把 UA 里的 Chrome 换成 HeadlessChrome。实测小红书就是靠这个
# 标记判定的: 带它则登录页连二维码都不渲染, 换成普通 UA 立刻可用; 窗口大小与
# navigator.webdriver 都不影响。所以无头启动时把 UA 还原成普通 Chrome 的样子。
_UA_PLATFORMS = {
    "darwin": "Macintosh; Intel Mac OS X 10_15_7",
    "win32": "Windows NT 10.0; Win64; x64",
}
_LINUX_UA_PLATFORM = "X11; Linux x86_64"
_VERSION_PATTERN = re.compile(r"(\d+)\.\d+\.\d+\.\d+")


def build_user_agent(major_version: str, platform: str | None = None) -> str:
    """拼一条与本机 Chrome 主版本一致、不带无头标记的 UA。

    Args:
        major_version: Chrome 主版本号。
        platform: 目标平台标识；默认取当前进程平台。

    Returns:
        与真实 Chrome 同形的 UA 字符串。
    """
    token = _UA_PLATFORMS.get(platform or sys.platform, _LINUX_UA_PLATFORM)
    return (
        f"Mozilla/5.0 ({token}) AppleWebKit/537.36 (KHTML, like Gecko) "
        f"Chrome/{major_version}.0.0.0 Safari/537.36"
    )


def parse_major_version(version_output: str) -> str | None:
    """从 ``chrome --version`` 的输出里取主版本号。

    Args:
        version_output: 可执行文件自报的版本行。

    Returns:
        主版本号；识别不出时返回 ``None``。
    """
    matched = _VERSION_PATTERN.search(version_output)
    return matched.group(1) if matched else None


async def read_major_version(executable: Path) -> str | None:
    """问一次浏览器自己的版本号。

    Args:
        executable: 已检测的浏览器可执行文件。

    Returns:
        主版本号；进程失败或输出不可识别时返回 ``None``。
    """
    try:
        process = await asyncio.create_subprocess_exec(
            str(executable),
            "--version",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
        )
        stdout, _ = await asyncio.wait_for(process.communicate(), timeout=10)
    except (OSError, TimeoutError):
        return None
    return parse_major_version(stdout.decode("utf-8", "replace"))


def build_launch_command(
    executable: Path,
    profile_dir: Path,
    headless: bool,
    offscreen: bool = False,
    user_agent: str | None = None,
) -> tuple[str, ...]:
    """构造限定专用目录和回环 CDP 的 Chromium 命令。

    Args:
        executable: 已检测的浏览器可执行文件。
        profile_dir: 与日常浏览器隔离的用户目录。
        headless: 是否隐藏浏览器窗口。
        offscreen: 是否把窗口挪到可视区之外；无头时该项没有意义。
        user_agent: 覆盖用的 UA；无头时用来抹掉 HeadlessChrome 标记。

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
        if user_agent:
            args.append(f"--user-agent={user_agent}")
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


async def build_managed_launch_command(
    executable: Path,
    profile_dir: Path,
    headless: bool,
    offscreen: bool,
) -> tuple[str, ...]:
    """按当前窗口设置拼出完整启动命令。

    无头时顺带把 UA 还原成普通 Chrome 的样子：版本号问浏览器自己要，问不到就
    保留默认 UA——那样无头下取不到登录二维码，但其余读取仍然可用。

    Args:
        executable: 已检测的浏览器可执行文件。
        profile_dir: 与日常浏览器隔离的用户目录。
        headless: 是否隐藏浏览器窗口。
        offscreen: 是否把窗口挪到可视区之外。

    Returns:
        不包含 Cookie 或页面凭据的启动参数。
    """
    user_agent = None
    if headless:
        major_version = await read_major_version(executable)
        if major_version:
            user_agent = build_user_agent(major_version)
        else:
            logger.warning("读不到受管浏览器版本号, 无头模式将保留默认 UA")
    return build_launch_command(
        executable,
        profile_dir,
        headless,
        offscreen,
        user_agent,
    )
