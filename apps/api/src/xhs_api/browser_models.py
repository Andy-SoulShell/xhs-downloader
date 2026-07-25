"""浏览器任务 HTTP 请求模型。"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, JsonValue, model_validator
from xhs_core.domain import BrowserDriver, BrowserTaskKind, BrowserTaskStatus


class BrowserTaskRequest(BaseModel):
    """本机调用方提交的浏览器任务。"""

    model_config = ConfigDict(extra="forbid")

    kind: BrowserTaskKind
    payload: dict[str, JsonValue] = Field(default_factory=dict)
    request_id: str | None = Field(default=None, min_length=1, max_length=128)
    target_driver: BrowserDriver = BrowserDriver.EXTENSION


class BrowserTaskStatusRequest(BaseModel):
    """扩展回传的浏览器任务运行状态。"""

    model_config = ConfigDict(extra="forbid")

    status: Literal[BrowserTaskStatus.RUNNING]
    message: str = Field(min_length=1, max_length=1000)


class BrowserTaskResultRequest(BaseModel):
    """扩展回传的浏览器任务终态和结构化结果。"""

    model_config = ConfigDict(extra="forbid")

    status: Literal[
        BrowserTaskStatus.SUCCEEDED,
        BrowserTaskStatus.FAILED,
        BrowserTaskStatus.NEEDS_REVIEW,
    ]
    message: str = Field(min_length=1, max_length=1000)
    result: dict[str, JsonValue] | None = None


class BrowserExtensionRegisterRequest(BaseModel):
    """浏览器任务扩展登记请求。"""

    model_config = ConfigDict(extra="forbid")

    extension_id: str = Field(min_length=1, max_length=128)


class BrowserExtensionTokenResponse(BaseModel):
    """只在登记响应中返回一次的扩展能力凭据。"""

    model_config = ConfigDict(extra="forbid")

    extension_id: str
    token: str


class BrowserExtensionStatus(BaseModel):
    """供本机管理界面展示的扩展在线状态。"""

    model_config = ConfigDict(extra="forbid")

    extension_id: str
    registered_at: datetime
    last_seen_at: datetime
    online: bool


class BrowserAccountChallengeClaimResponse(BaseModel):
    """扩展一次性账号挑战领取响应。"""

    model_config = ConfigDict(extra="forbid")

    challenge_id: str = Field(pattern=r"^[0-9a-f]{32}$")
    algorithm: Literal["HMAC-SHA-256"] = "HMAC-SHA-256"
    challenge_key: str = Field(repr=False)
    expires_at: datetime
    lease_token: str = Field(repr=False)


class BrowserAccountChallengeAnswerRequest(BaseModel):
    """扩展账号挑战的脱敏回答。"""

    model_config = ConfigDict(extra="forbid")

    status: Literal["proved", "logged_out", "unverified"]
    proof: str | None = Field(
        default=None,
        pattern=r"^[0-9a-f]{64}$",
        repr=False,
    )

    @model_validator(mode="after")
    def validate_proof_state(self) -> "BrowserAccountChallengeAnswerRequest":
        """确保证明摘要只存在于已证明状态。

        Returns:
            状态与摘要约束有效的当前模型。

        Raises:
            ValueError: 状态与摘要不匹配。
        """
        if (self.status == "proved") is (self.proof is not None):
            return self
        raise ValueError("proved 状态必须且只能携带 64 位十六进制证明")
