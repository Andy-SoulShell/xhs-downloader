"""Loguru 日志配置与标准库日志桥接。"""

import logging
import os
import sys
from pathlib import Path
from typing import TextIO

from loguru import logger


class _InterceptHandler(logging.Handler):
    """把标准库日志记录转发给 Loguru。"""

    def emit(self, record: logging.LogRecord) -> None:
        """转发一条标准库日志记录。

        Args:
            record: 标准库产生的日志记录。
        """
        try:
            level: str | int = logger.level(record.levelname).name
        except ValueError:
            level = record.levelno

        frame = logging.currentframe()
        depth = 2
        while frame and frame.f_code.co_filename == logging.__file__:
            frame = frame.f_back
            depth += 1
        logger.bind(source=record.name).opt(
            depth=depth,
            exception=record.exc_info,
        ).log(
            level,
            record.getMessage(),
        )


def configure_logging(
    level: str = "INFO",
    log_file: Path | None = None,
) -> None:
    """配置 Loguru，并接管标准库日志。

    Args:
        level: 最低日志级别，不区分大小写。
        log_file: 可选的持久化日志文件；桌面无控制台模式必须提供。
    """
    logger.remove()
    stderr = _available_stderr()
    if stderr is not None:
        logger.add(
            stderr,
            level=level.upper(),
            format=_format_record,
            colorize=stderr.isatty(),
            backtrace=False,
            diagnose=False,
        )
    if log_file is not None:
        resolved_log = log_file.expanduser().resolve()
        resolved_log.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        resolved_log.parent.chmod(0o700)
        logger.add(
            resolved_log,
            level=level.upper(),
            format=_format_record,
            colorize=False,
            backtrace=False,
            diagnose=False,
            rotation="10 MB",
            retention=5,
            opener=_secure_log_opener,
        )
    if stderr is None and log_file is None:
        logger.add(lambda _: None, level=level.upper())
    logging.basicConfig(
        handlers=[_InterceptHandler()],
        level=0,
        force=True,
    )
    for name in tuple(logging.root.manager.loggerDict):
        standard_logger = logging.getLogger(name)
        standard_logger.handlers.clear()
        standard_logger.propagate = True
    for name in ("httpx", "httpcore", "aiosqlite"):
        logging.getLogger(name).setLevel(logging.WARNING)


def _available_stderr() -> TextIO | None:
    stderr = sys.stderr or sys.__stderr__
    return stderr if stderr is not None and hasattr(stderr, "isatty") else None


def _secure_log_opener(path: str, flags: int) -> int:
    return os.open(path, flags, 0o600)


def _format_record(record: dict) -> str:
    source = record["extra"].get("source", record["name"])
    record["extra"]["display_source"] = source
    return (
        "<green>{time:YYYY-MM-DD HH:mm:ss.SSS}</green> | "
        "<level>{level: <8}</level> | "
        "<cyan>{extra[display_source]}</cyan> - "
        "<level>{message}</level>\n{exception}"
    )
