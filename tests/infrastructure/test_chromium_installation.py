"""Chromium 可执行文件检测测试。"""

from pathlib import Path

from xhs_adapters.chromium_installation import (
    _windows_installation_candidates,
)


def test_windows_candidates_include_edge_for_ordinary_users() -> None:
    """确保只安装系统常见 Edge 的 Windows 用户也可使用受管模式。"""
    candidates = _windows_installation_candidates(
        {
            "PROGRAMFILES": "C:/Program Files",
            "LOCALAPPDATA": "C:/Users/Synthetic/AppData/Local",
        }
    )

    assert Path("C:/Program Files/Microsoft/Edge/Application/msedge.exe") in candidates
    assert (
        Path("C:/Users/Synthetic/AppData/Local/Microsoft/Edge/Application/msedge.exe")
        in candidates
    )
