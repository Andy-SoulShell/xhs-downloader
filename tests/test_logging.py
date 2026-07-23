"""Loguru 日志配置测试。"""

import logging

from src.logging import configure_logging


def test_sensitive_http_logs_are_suppressed() -> None:
    """确保可能包含完整请求 URL 的第三方日志不会使用 INFO 级别。"""
    configure_logging("info")

    assert logging.getLogger("httpx").getEffectiveLevel() == logging.WARNING
    assert logging.getLogger("httpcore").getEffectiveLevel() == logging.WARNING
