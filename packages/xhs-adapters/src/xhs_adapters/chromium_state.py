"""受管 Chromium 的非敏感运行状态文件。"""

import json
import os
from pathlib import Path


def read_runtime_port(path: Path) -> int | None:
    """读取上一次记录的本机 CDP 端口。

    Args:
        path: 运行状态 JSON 文件。

    Returns:
        合法端口；文件缺失或内容无效时返回 ``None``。
    """
    try:
        payload = json.loads(path.read_text("utf-8"))
        port = int(payload["cdp_port"])
    except (OSError, ValueError, TypeError, KeyError, json.JSONDecodeError):
        return None
    return port if 1 <= port <= 65535 else None


def write_runtime_state(
    path: Path,
    browser_pid: int,
    cdp_port: int,
    executable_name: str,
) -> None:
    """原子保存不含浏览数据和完整路径的运行状态。

    Args:
        path: 运行状态 JSON 文件。
        browser_pid: Chromium 子进程标识。
        cdp_port: 固定回环地址上的调试端口。
        executable_name: 浏览器可执行文件名称。
    """
    payload = {
        "manager_pid": os.getpid(),
        "browser_pid": browser_pid,
        "cdp_port": cdp_port,
        "executable_name": executable_name,
    }
    temporary = path.with_suffix(".tmp")
    temporary.write_text(
        json.dumps(payload, ensure_ascii=False),
        encoding="utf-8",
    )
    temporary.chmod(0o600)
    os.replace(temporary, path)
