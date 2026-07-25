"""受管浏览器生命周期模型。"""

from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ManagedBrowserState(StrEnum):
    """受管 Chromium 的运行状态。"""

    STOPPED = "stopped"
    STARTING = "starting"
    RUNNING = "running"
    STOPPING = "stopping"
    ERROR = "error"


class ManagedBrowserStatus(BaseModel):
    """受管浏览器对管理端公开的脱敏状态。

    Attributes:
        installed: 当前配置是否能找到可执行文件。
        state: 浏览器生命周期状态。
        executable_name: 浏览器可执行文件名称，不包含完整路径。
        cdp_host: 固定的本机回环监听地址。
        cdp_port: Chromium 实际分配的调试端口。
        profile_persistent: 登录资料是否保存在专用持久化目录。
        message: 面向用户的自然语言状态说明。
    """

    model_config = ConfigDict(extra="forbid")

    installed: bool
    state: ManagedBrowserState
    executable_name: str | None = Field(default=None, max_length=200)
    cdp_host: Literal["127.0.0.1"] = "127.0.0.1"
    cdp_port: int | None = Field(default=None, ge=1, le=65535)
    profile_persistent: bool = True
    message: str = Field(default="", max_length=500)
