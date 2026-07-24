"""接口测试使用的合成应用服务。"""

from xhs_core.domain import DownloadArtifact, DownloadOutcome, MediaKind, XhsError

from tests.helpers import make_detail


class FakeService:
    """记录接口调用且不访问网络的应用服务替身。"""

    def __init__(self, *, fail: bool = False, with_artifact: bool = False) -> None:
        self.fail = fail
        self.with_artifact = with_artifact
        self.download_arguments = None

    async def __aenter__(self) -> "FakeService":
        """进入合成服务生命周期。

        Returns:
            当前服务实例。
        """
        return self

    async def __aexit__(self, exc_type, exc_value, traceback) -> None:
        """退出合成服务生命周期。

        Args:
            exc_type: 异常类型。
            exc_value: 异常值。
            traceback: 异常调用栈。
        """
        return None

    async def get_detail(self, text: str, cookie: str | None = None):
        """返回合成作品详情。

        Args:
            text: 接口传入的链接。
            cookie: 单次请求 Cookie。

        Returns:
            合成作品。

        Raises:
            XhsError: 测试要求模拟失败时抛出。
        """
        if self.fail:
            raise XhsError("合成接口错误")
        return make_detail(text).model_copy(update={"title": "合成测试作品"})

    async def download(
        self,
        text: str,
        indexes: set[int] | None = None,
        force: bool = False,
        cookie: str | None = None,
    ) -> DownloadOutcome:
        """返回合成下载结果。

        Args:
            text: 接口传入的链接。
            indexes: 指定的媒体序号。
            force: 是否强制下载。
            cookie: 单次请求 Cookie。

        Returns:
            合成下载结果。

        Raises:
            XhsError: 测试要求模拟失败时抛出。
        """
        if self.fail:
            raise XhsError("合成接口错误")
        self.download_arguments = (text, indexes, force, cookie)
        artifacts = (
            [
                DownloadArtifact(
                    path="download/synthetic.mp4",
                    sha256="0" * 64,
                    size=9,
                    media_index=1,
                    kind=MediaKind.VIDEO,
                )
            ]
            if self.with_artifact
            else []
        )
        return DownloadOutcome(
            message="作品文件下载完成",
            detail=await self.get_detail(text, cookie),
            artifacts=artifacts,
        )
