"""Chrome 与 Chromium 可执行文件检测。"""

import os
import shutil
import sys
from collections.abc import Mapping
from pathlib import Path


def find_chromium_executable(configured: Path | None = None) -> Path | None:
    """查找可用于受管模式的 Chrome 或 Chromium。

    Args:
        configured: 用户显式配置的可执行文件。

    Returns:
        可执行文件路径；未找到时返回 ``None``。
    """
    candidates = (
        [configured.expanduser()] if configured is not None else _platform_candidates()
    )
    for candidate in candidates:
        if (
            candidate
            and candidate.is_file()
            and (os.name == "nt" or os.access(candidate, os.X_OK))
        ):
            return candidate.resolve()
    return None


def _platform_candidates() -> list[Path]:
    names = [
        "google-chrome",
        "google-chrome-stable",
        "chromium",
        "chromium-browser",
    ]
    found = [Path(value) for name in names if (value := shutil.which(name))]
    if sys.platform == "darwin":
        found.extend(
            [
                Path("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
                Path("/Applications/Chromium.app/Contents/MacOS/Chromium"),
                Path("/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"),
            ]
        )
    if os.name == "nt":
        found.extend(_windows_installation_candidates(os.environ))
    return found


def _windows_installation_candidates(
    environment: Mapping[str, str],
) -> list[Path]:
    candidates: list[Path] = []
    for root_name in ("PROGRAMFILES", "PROGRAMFILES(X86)", "LOCALAPPDATA"):
        if root := environment.get(root_name):
            candidates.extend(
                [
                    Path(root, "Google", "Chrome", "Application", "chrome.exe"),
                    Path(
                        root,
                        "Microsoft",
                        "Edge",
                        "Application",
                        "msedge.exe",
                    ),
                ]
            )
    return candidates
