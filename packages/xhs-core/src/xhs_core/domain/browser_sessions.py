"""浏览器登录会话任务的结构化结果。"""

from datetime import datetime
from typing import Literal, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator

_QR_DATA_PATTERN = r"^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=\r\n]+$"


class LoginQrCodeResult(BaseModel):
    """短期登录二维码或已有登录状态。

    二维码只允许使用受限的图片 Data URL，并在交付调用方后从任务记录中清除。
    """

    model_config = ConfigDict(extra="forbid")

    is_logged_in: bool
    image_data_url: str | None = Field(
        default=None,
        max_length=512_000,
        pattern=_QR_DATA_PATTERN,
        repr=False,
    )
    expires_at: datetime | None = None
    consumed: bool = False

    @model_validator(mode="after")
    def validate_state(self) -> Self:
        """校验登录状态、二维码和消费标记的组合。

        Returns:
            已通过组合校验的结果。

        Raises:
            ValueError: 未登录结果缺少可用二维码，或已登录结果携带二维码。
        """
        if self.is_logged_in and self.image_data_url:
            raise ValueError("已登录结果不能携带二维码")
        if (
            not self.is_logged_in
            and not self.consumed
            and (not self.image_data_url or not self.expires_at)
        ):
            raise ValueError("未登录结果必须包含短期二维码和过期时间")
        return self


class BrowserCookieDeletionResult(BaseModel):
    """浏览器已完成小红书 Cookie 清理的结果。"""

    model_config = ConfigDict(extra="forbid")

    target: Literal["browser"]
    deleted: Literal[True]
