"""扩展领取发布任务与状态回传用例。"""

from asyncio import to_thread
from datetime import UTC, datetime, timedelta
from hashlib import sha256
from pathlib import Path
from secrets import token_urlsafe

from xhs_core.domain import (
    BrowserDriver,
    PublicationClaim,
    PublicationError,
    PublicationTask,
    PublicationTaskStatus,
)
from xhs_core.domain.publication_ports import (
    PublicationAssetStore,
    PublicationTaskRepository,
)

from .publication_scheduler import PublicationScheduler

_ALLOWED_TRANSITIONS = {
    PublicationTaskStatus.CLAIMED: {
        PublicationTaskStatus.FILLING,
        PublicationTaskStatus.AWAITING_VERIFICATION,
        PublicationTaskStatus.FAILED,
        PublicationTaskStatus.NEEDS_REVIEW,
    },
    PublicationTaskStatus.FILLING: {
        PublicationTaskStatus.FILLING,
        PublicationTaskStatus.PUBLISHING,
        PublicationTaskStatus.AWAITING_VERIFICATION,
        PublicationTaskStatus.FAILED,
        PublicationTaskStatus.NEEDS_REVIEW,
    },
    PublicationTaskStatus.PUBLISHING: {
        PublicationTaskStatus.PUBLISHING,
        PublicationTaskStatus.PUBLISHED,
        PublicationTaskStatus.AWAITING_VERIFICATION,
        PublicationTaskStatus.FAILED,
        PublicationTaskStatus.NEEDS_REVIEW,
    },
    PublicationTaskStatus.AWAITING_VERIFICATION: {
        PublicationTaskStatus.AWAITING_VERIFICATION,
        PublicationTaskStatus.FILLING,
        PublicationTaskStatus.PUBLISHING,
        PublicationTaskStatus.FAILED,
        PublicationTaskStatus.NEEDS_REVIEW,
    },
}
_TERMINAL = {
    PublicationTaskStatus.PUBLISHED,
    PublicationTaskStatus.NEEDS_REVIEW,
    PublicationTaskStatus.FAILED,
}
_LEASED = {
    PublicationTaskStatus.CLAIMED,
    PublicationTaskStatus.FILLING,
    PublicationTaskStatus.PUBLISHING,
    PublicationTaskStatus.AWAITING_VERIFICATION,
}


class PublicationExecutionService:
    """向已登记扩展提供短期租约和受控素材。

    Args:
        repository: 发布任务仓储。
        assets: 发布素材存储。
        scheduler: 排期与异常租约恢复服务。
        lease_seconds: 扩展无心跳时的租约秒数。
    """

    def __init__(
        self,
        repository: PublicationTaskRepository,
        assets: PublicationAssetStore,
        scheduler: PublicationScheduler,
        lease_seconds: int,
    ) -> None:
        self._repository = repository
        self._assets = assets
        self._scheduler = scheduler
        self._lease_seconds = lease_seconds

    async def claim(
        self,
        executor_id: str,
        preferred_task_id: str | None = None,
        target_driver: BrowserDriver = BrowserDriver.EXTENSION,
    ) -> PublicationClaim | None:
        """为指定浏览器驱动原子领取一个任务。

        Args:
            executor_id: 已登记扩展或受管 Worker 实例 ID。
            preferred_task_id: 手动一键发布指定的任务。
            target_driver: 只领取该驱动的就绪任务。

        Returns:
            带短期令牌的任务；没有就绪任务时返回 ``None``。
        """
        await self._scheduler.reconcile()
        now = datetime.now(UTC)
        token = token_urlsafe(32)
        task = await self._repository.claim_ready(
            executor_id,
            now,
            now + timedelta(seconds=self._lease_seconds),
            _token_hash(token),
            preferred_task_id,
            target_driver,
        )
        return PublicationClaim(task=task, lease_token=token) if task else None

    async def update_status(
        self,
        task_id: str,
        lease_token: str,
        status: PublicationTaskStatus,
        message: str,
        result_url: str | None = None,
        publish_attempted: bool | None = None,
    ) -> PublicationTask:
        """按状态机推进扩展任务。

        Args:
            task_id: 任务唯一标识。
            lease_token: 扩展领取任务时获得的短期令牌。
            status: 目标状态。
            message: 用户可见的执行说明。
            result_url: 发布成功后的作品地址。
            publish_attempted: 是否在本次更新中冻结发布点击已经开始。

        Returns:
            更新后的任务。

        Raises:
            PublicationError: 租约无效或状态转换不允许。
        """
        task = await self._require_lease(task_id, lease_token)
        if status not in _ALLOWED_TRANSITIONS.get(task.status, set()):
            raise PublicationError(f"不能从 {task.status.value} 转换到 {status.value}")
        if task.publish_attempted and publish_attempted is False:
            raise PublicationError("已经尝试发布的任务不能清除安全标记")
        if publish_attempted is True and status not in {
            PublicationTaskStatus.PUBLISHING,
            PublicationTaskStatus.AWAITING_VERIFICATION,
        }:
            raise PublicationError("发布尝试标记只能用于发布或验证阶段")
        now = datetime.now(UTC)
        updated = task.model_copy(
            update={
                "status": status,
                "message": message[:1000],
                "result_url": result_url or task.result_url,
                "publish_attempted": (
                    task.publish_attempted or publish_attempted is True
                ),
                "lease_expires_at": (
                    None
                    if status in _TERMINAL
                    else now + timedelta(seconds=self._lease_seconds)
                ),
                "updated_at": now,
            }
        )
        if not await self._repository.save_task_if_status(updated, task.status):
            raise PublicationError("发布任务状态已经变化，请刷新后重试")
        if status in _TERMINAL:
            await self._repository.clear_lease(task_id)
        return updated

    async def asset_paths(
        self,
        task_id: str,
        lease_token: str,
    ) -> tuple[Path, ...]:
        """返回按位置排序且通过大小和摘要复核的受控素材路径。

        Args:
            task_id: 任务唯一标识。
            lease_token: 短期租约令牌。

        Returns:
            严格属于冻结发布包的素材绝对路径。

        Raises:
            PublicationError: 租约、文件大小或 SHA-256 不匹配。
        """
        task = await self._require_lease(task_id, lease_token)
        ordered = sorted(task.package.assets, key=lambda asset: asset.position)
        paths: list[Path] = []
        for asset in ordered:
            path = self._assets.path_for(task.package.draft_id, asset)
            valid = await to_thread(
                _matches_asset,
                path,
                asset.size,
                asset.sha256,
            )
            if not valid:
                raise PublicationError("发布素材缺失或内容指纹校验失败")
            paths.append(path)
        return tuple(paths)

    async def asset_path(
        self,
        task_id: str,
        lease_token: str,
        asset_id: str,
    ) -> Path:
        """验证租约并返回任务素材路径。

        Args:
            task_id: 任务唯一标识。
            lease_token: 短期租约令牌。
            asset_id: 素材唯一标识。

        Returns:
            已验证的素材路径。

        Raises:
            PublicationError: 租约、素材或文件无效。
        """
        task = await self._require_lease(task_id, lease_token)
        asset = next(
            (item for item in task.package.assets if item.asset_id == asset_id),
            None,
        )
        if not asset:
            raise PublicationError("发布素材不存在")
        path = self._assets.path_for(task.package.draft_id, asset)
        if not path.is_file() or path.stat().st_size != asset.size:
            raise PublicationError("发布素材缺失或大小校验失败")
        return path

    async def require(self, task_id: str) -> PublicationTask:
        """读取任务，不存在时抛出领域错误。

        Args:
            task_id: 任务唯一标识。

        Returns:
            已存在任务。

        Raises:
            PublicationError: 任务不存在。
        """
        task = await self._repository.get_task(task_id)
        if not task:
            raise PublicationError("发布任务不存在")
        return task

    async def _require_lease(
        self,
        task_id: str,
        lease_token: str,
    ) -> PublicationTask:
        task = await self.require(task_id)
        valid_hash = await self._repository.validate_lease(
            task_id, _token_hash(lease_token)
        )
        lease_active = (
            task.status in _LEASED
            and task.lease_expires_at is not None
            and task.lease_expires_at > datetime.now(UTC)
        )
        if not valid_hash or not lease_active:
            raise PublicationError("发布任务租约无效或已经过期")
        return task


def _token_hash(token: str) -> str:
    return sha256(token.encode("utf-8")).hexdigest()


def _matches_asset(path: Path, expected_size: int, expected_sha256: str) -> bool:
    try:
        if not path.is_file() or path.stat().st_size != expected_size:
            return False
        digest = sha256()
        with path.open("rb") as stream:
            while chunk := stream.read(1024 * 1024):
                digest.update(chunk)
        return digest.hexdigest() == expected_sha256
    except OSError:
        return False
