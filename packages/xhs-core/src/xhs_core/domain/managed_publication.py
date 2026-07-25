"""受管浏览器发布执行器的结构化进度、结果与端口。"""

from collections.abc import Awaitable, Callable, Sequence
from pathlib import Path
from typing import Literal, Protocol, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator

from .publication import PublicationTask, PublicationTaskStatus


class ManagedPublicationProgress(BaseModel):
    """受管发布执行器要求 Worker 原子保存的进度。

    Attributes:
        status: 填充、发布或等待用户验证阶段。
        message: 不包含用户正文和页面原文的状态摘要。
        publish_attempted: 是否已经进入禁止自动重试的发布点击阶段。
    """

    model_config = ConfigDict(extra="forbid")

    status: Literal[
        PublicationTaskStatus.FILLING,
        PublicationTaskStatus.PUBLISHING,
        PublicationTaskStatus.AWAITING_VERIFICATION,
    ]
    message: str = Field(min_length=1, max_length=1000)
    publish_attempted: bool = False

    @model_validator(mode="after")
    def validate_attempt(self) -> Self:
        """限制发布尝试标记只能出现在发布或验证阶段。

        Returns:
            已通过组合校验的进度。

        Raises:
            ValueError: 填充阶段错误携带发布尝试标记。
        """
        if self.publish_attempted and self.status is PublicationTaskStatus.FILLING:
            raise ValueError("填充阶段不能标记已经尝试发布")
        return self


class ManagedPublicationOutcome(BaseModel):
    """受管发布页面完成后的明确终态。

    Attributes:
        status: 页面明确发布、明确失败或结果不确定。
        message: 不包含页面原文和用户内容的结果摘要。
        result_url: 页面回读到的可选作品地址。
    """

    model_config = ConfigDict(extra="forbid")

    status: Literal[
        PublicationTaskStatus.PUBLISHED,
        PublicationTaskStatus.FAILED,
        PublicationTaskStatus.NEEDS_REVIEW,
    ]
    message: str = Field(min_length=1, max_length=1000)
    result_url: str | None = Field(default=None, max_length=4096)


ManagedPublicationProgressReporter = Callable[
    [ManagedPublicationProgress],
    Awaitable[None],
]


class ManagedPublicationExecutor(Protocol):
    """在同一受管页面中执行一个已领取的发布任务。"""

    async def execute(
        self,
        task: PublicationTask,
        asset_paths: Sequence[Path],
        report: ManagedPublicationProgressReporter,
    ) -> ManagedPublicationOutcome:
        """执行发布并返回页面严格回读后的终态。

        Args:
            task: 已进入填充阶段的受管发布任务。
            asset_paths: 按任务素材位置排序的受控绝对路径。
            report: 点击或暂停前必须成功完成的原子进度回调。

        Returns:
            明确发布、明确失败或需要人工核对的结果。
        """
        ...

    async def resume(self, task_id: str) -> bool:
        """恢复正在同一页面等待用户验证的任务。

        Args:
            task_id: 等待恢复的发布任务标识。

        Returns:
            找到并唤醒对应任务时返回真。
        """
        ...

    async def close(self) -> None:
        """取消等待并断开页面自动化会话。"""
        ...
