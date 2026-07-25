"""发布包在冻结为任务前使用的领域校验。"""

from xhs_core.domain import (
    BrowserDriver,
    PublicationDraft,
    PublicationError,
    PublicationVisibility,
)


def validate_publication_package(
    draft: PublicationDraft,
    target_driver: BrowserDriver,
) -> None:
    """校验发布包结构与目标驱动首批能力边界。

    Args:
        draft: 待冻结的完整草稿。
        target_driver: 提交时选择的浏览器执行驱动。

    Raises:
        PublicationError: 素材组合、正文或受管首批选项无效。
    """
    if not draft.assets:
        raise PublicationError("发布草稿至少需要一个素材")
    videos = [asset for asset in draft.assets if asset.media_type.startswith("video/")]
    if videos and (len(videos) != 1 or len(draft.assets) != 1):
        raise PublicationError("视频笔记只能包含一个视频，不能混合图片")
    if videos and draft.is_original:
        raise PublicationError("当前原创声明只支持图文笔记")
    if not videos and len(draft.assets) > 18:
        raise PublicationError("图文笔记最多包含 18 张图片")
    if not draft.title and not draft.body:
        raise PublicationError("发布标题和正文不能同时为空")
    if target_driver is not BrowserDriver.MANAGED:
        return
    if draft.visibility is not PublicationVisibility.PRIVATE:
        raise PublicationError("受管浏览器首批发布只支持仅自己可见")
    if draft.is_original:
        raise PublicationError("受管浏览器首批发布暂不支持原创声明")
    if draft.products:
        raise PublicationError("受管浏览器首批发布暂不支持绑定商品")
