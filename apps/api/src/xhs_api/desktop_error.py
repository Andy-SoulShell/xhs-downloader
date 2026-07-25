"""桌面无控制台启动失败时的本机提示。"""

import os
import shutil
import subprocess
import sys
from contextlib import suppress


def show_startup_error(message: str) -> None:
    """使用当前操作系统可用的原生方式显示启动错误。

    Args:
        message: 已脱敏且可直接展示给用户的错误说明。
    """
    cleaned = " ".join(message.split())[:500]
    if sys.platform == "darwin":
        environment = os.environ.copy()
        environment["XHS_DESKTOP_ERROR"] = cleaned
        _run_quietly(
            [
                "osascript",
                "-e",
                'display alert "xhs-downloader 无法启动" '
                'message (system attribute "XHS_DESKTOP_ERROR") as critical',
            ],
            environment,
        )
        return
    if os.name == "nt":
        import ctypes

        ctypes.windll.user32.MessageBoxW(
            0,
            cleaned,
            "xhs-downloader 无法启动",
            0x10,
        )
        return
    if executable := shutil.which("zenity"):
        _run_quietly(
            [
                executable,
                "--error",
                "--title=xhs-downloader 无法启动",
                f"--text={cleaned}",
            ]
        )
    elif sys.stderr is not None:
        print(f"xhs-downloader 无法启动：{cleaned}", file=sys.stderr)


def _run_quietly(
    command: list[str],
    environment: dict[str, str] | None = None,
) -> None:
    with suppress(OSError, subprocess.TimeoutExpired):
        subprocess.run(
            command,
            env=environment,
            check=False,
            timeout=8,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
