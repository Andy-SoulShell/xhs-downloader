"""Loguru 日志配置测试。"""

import logging
import os

from loguru import logger
from xhs_adapters.logging import configure_logging


def test_sensitive_http_logs_are_suppressed() -> None:
    """确保可能包含完整请求 URL 的第三方日志不会使用 INFO 级别。"""
    configure_logging("info")

    assert logging.getLogger("httpx").getEffectiveLevel() == logging.WARNING
    assert logging.getLogger("httpcore").getEffectiveLevel() == logging.WARNING


def test_windowed_desktop_writes_logs_without_stderr(
    monkeypatch,
    tmp_path,
) -> None:
    """确保 Windows 无控制台启动时仍能写入持久日志。

    Args:
        monkeypatch: Pytest 提供的属性替换工具。
        tmp_path: Pytest 提供的临时目录。
    """
    import xhs_adapters.logging as logging_module

    monkeypatch.setattr(logging_module.sys, "stderr", None)
    monkeypatch.setattr(logging_module.sys, "__stderr__", None)
    path = tmp_path.joinpath("logs", "desktop.log")

    configure_logging("info", path)
    logger.info("合成桌面日志")
    logger.remove()

    assert "合成桌面日志" in path.read_text(encoding="utf-8")
    if os.name != "nt":
        assert path.stat().st_mode & 0o777 == 0o600
        assert path.parent.stat().st_mode & 0o777 == 0o700
