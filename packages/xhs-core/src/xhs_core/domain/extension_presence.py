"""浏览器扩展在线状态模型。"""

from datetime import datetime

from pydantic import BaseModel, Field


class ExtensionPresence(BaseModel):
    """服务端保存的扩展登记与最近心跳。

    Attributes:
        extension_id: 浏览器分配的扩展实例标识。
        registered_at: 最近一次签发能力令牌的时间。
        last_seen_at: 最近一次通过能力令牌校验的时间。
    """

    extension_id: str = Field(min_length=1, max_length=128)
    registered_at: datetime
    last_seen_at: datetime
