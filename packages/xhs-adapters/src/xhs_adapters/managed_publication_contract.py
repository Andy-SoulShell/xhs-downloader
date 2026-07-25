"""校验受管发布页面适配器的固定动作和严格回读结果。"""

from dataclasses import dataclass
from typing import Any, Literal
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo

from xhs_core.domain import (
    BrowserDriver,
    ManagedBrowserError,
    PublicationMode,
    PublicationTask,
    PublicationTaskStatus,
    PublicationVisibility,
)

ADAPTER_GLOBAL = "__XHS_DOWNLOADER_MANAGED_PUBLISHER_ADAPTER__"
ADAPTER_VERSION_EXPRESSION = f"() => window.{ADAPTER_GLOBAL}?.version"
PREPARE_UPLOAD_EXPRESSION = f"(task) => window.{ADAPTER_GLOBAL}.prepareUpload(task)"
FILL_EXPRESSION = f"(task) => window.{ADAPTER_GLOBAL}.fill(task)"
VERIFY_SCHEDULE_EXPRESSION = f"() => window.{ADAPTER_GLOBAL}.verifySchedule()"
PREPARE_PUBLISH_EXPRESSION = f"() => window.{ADAPTER_GLOBAL}.preparePublish()"
OBSERVE_EXPRESSION = f"() => window.{ADAPTER_GLOBAL}.observeOutcome()"
UPLOAD_SELECTOR = "[data-xhd-managed-upload='true']"
SCHEDULE_SELECTOR = "[data-xhd-managed-schedule='true']"
PUBLISH_SELECTOR = "[data-xhd-managed-publish='true']"
VERIFICATION_MESSAGE = "创作平台要求完成安全验证"
_CREATOR_URL = "https://creator.xiaohongshu.com/publish/publish"
_BEIJING = ZoneInfo("Asia/Shanghai")


@dataclass(frozen=True)
class ScheduleInput:
    """已绑定固定控件且按北京时间复核的官方定时输入。"""

    selector: str
    value: str


@dataclass(frozen=True)
class SelectorPublishClick:
    """使用固定页面选择器完成的发布点击。"""

    selector: str


@dataclass(frozen=True)
class CapturedPublishClick:
    """使用可信键盘输入激活封闭影子根内已聚焦的真实发布按钮。"""


type PublicationClick = SelectorPublishClick | CapturedPublishClick


def validate_publication_task(task: PublicationTask) -> Literal["image", "video"]:
    """复核执行器收到的受管发布任务边界。

    Args:
        task: Worker 已领取并推进到填充阶段的发布任务。

    Returns:
        发布页面使用的素材类型。

    Raises:
        ManagedBrowserError: 驱动、状态、可见范围或素材组合无效。
    """
    draft = task.package
    if task.target_driver is not BrowserDriver.MANAGED:
        raise ManagedBrowserError("发布任务没有固定到受管浏览器")
    if task.status is not PublicationTaskStatus.FILLING:
        raise ManagedBrowserError("受管发布任务必须先进入填充阶段")
    if task.publish_attempted:
        raise ManagedBrowserError("已经尝试发布的任务不能再次自动执行")
    if draft.fingerprint() != task.package_fingerprint:
        raise ManagedBrowserError("受管发布任务内容指纹不一致")
    if draft.visibility is not PublicationVisibility.PRIVATE or draft.products:
        raise ManagedBrowserError("受管发布任务选项超出当前安全边界")
    if not draft.title and not draft.body:
        raise ManagedBrowserError("发布标题和正文不能同时为空")
    videos = [item for item in draft.assets if item.media_type.startswith("video/")]
    images = [item for item in draft.assets if item.media_type.startswith("image/")]
    if videos:
        if len(videos) != 1 or len(draft.assets) != 1 or draft.is_original:
            raise ManagedBrowserError("受管视频发布素材组合无效")
        return "video"
    if not images or len(images) != len(draft.assets) or len(images) > 18:
        raise ManagedBrowserError("受管图文发布素材组合无效")
    return "image"


def publication_page_url(media_kind: Literal["image", "video"]) -> str:
    """生成不携带任务标识或用户内容的创作页地址。

    Args:
        media_kind: 图文或视频发布模式。

    Returns:
        仅含固定媒体类型参数的创作页地址。
    """
    return f"{_CREATOR_URL}?target={media_kind}"


def validate_creator_page(url: str) -> None:
    """确认可信输入前页面仍停留在创作平台固定路径。

    Args:
        url: 只在进程内检查且不写入消息或日志的当前页面地址。

    Raises:
        ManagedBrowserError: 页面已经离开受信任创作平台。
    """
    try:
        parsed = urlsplit(url)
    except ValueError as error:
        raise ManagedBrowserError("受管发布页面地址无效") from error
    if (
        parsed.scheme != "https"
        or parsed.netloc != "creator.xiaohongshu.com"
        or parsed.path != "/publish/publish"
    ):
        raise ManagedBrowserError("受管发布页面已经离开创作平台")


def is_verification_response(value: Any) -> bool:
    """判断步骤响应是否为固定的可恢复安全验证信号。

    Args:
        value: 页面适配器返回的未知值。

    Returns:
        仅完整匹配固定验证响应时返回真。
    """
    return value == {
        "ok": False,
        "message": VERIFICATION_MESSAGE,
        "verification": True,
    }


def validate_upload_response(value: Any, media_kind: str) -> None:
    """严格核验上传动作只指向固定文件输入框。

    Args:
        value: 页面适配器上传预检响应。
        media_kind: 原任务确定的图片或视频类型。

    Raises:
        ManagedBrowserError: 响应与固定协议不一致。
    """
    expected = {
        "ok": True,
        "message": "创作页素材入口已准备",
        "action": "upload",
        "mediaKind": media_kind,
        "selector": UPLOAD_SELECTOR,
    }
    if value != expected:
        raise ManagedBrowserError("受管发布上传预检响应无效")


def validate_fill_response(
    value: Any,
    task: PublicationTask,
) -> ScheduleInput | None:
    """严格核验表单结果并提取可选官方定时输入。

    Args:
        value: 页面适配器表单填充响应。
        task: 冻结了发布模式和绝对时间的原任务。

    Returns:
        官方定时任务的固定输入；立即发布或本地定时返回空。

    Raises:
        ManagedBrowserError: 响应动作、选择器或北京时间不一致。
    """
    if task.mode is not PublicationMode.PLATFORM_SCHEDULED:
        if value != {"ok": True, "message": "创作页内容和发布选项已核验"}:
            raise ManagedBrowserError("受管发布表单核验响应无效")
        return None
    if task.scheduled_at.utcoffset() is None:
        raise ManagedBrowserError("受管发布官方定时时间缺少时区")
    expected_value = task.scheduled_at.astimezone(_BEIJING).strftime("%Y-%m-%d %H:%M")
    expected = {
        "ok": True,
        "message": "官方定时输入已准备",
        "action": "type_schedule",
        "selector": SCHEDULE_SELECTOR,
        "value": expected_value,
    }
    if value != expected:
        raise ManagedBrowserError("受管发布官方定时响应无效")
    return ScheduleInput(selector=SCHEDULE_SELECTOR, value=expected_value)


def validate_schedule_response(value: Any) -> None:
    """严格核验官方定时输入已经由页面回读确认。

    Args:
        value: 页面适配器定时回读响应。

    Raises:
        ManagedBrowserError: 页面没有返回固定成功响应。
    """
    if value != {"ok": True, "message": "官方定时时间已回读确认"}:
        raise ManagedBrowserError("受管发布官方定时回读无效")


def validate_publish_response(value: Any) -> PublicationClick:
    """把固定发布按钮响应转换为唯一可信点击动作。

    Args:
        value: 页面适配器发布按钮预检响应。

    Returns:
        固定选择器点击或已聚焦真实按钮的可信键盘激活。

    Raises:
        ManagedBrowserError: 响应包含未知动作或选择器。
    """
    native = {
        "ok": True,
        "message": "原生发布按钮已核验",
        "action": "click_selector",
        "selector": PUBLISH_SELECTOR,
    }
    if value == native:
        return SelectorPublishClick(selector=PUBLISH_SELECTOR)
    captured = {
        "ok": True,
        "message": "封闭发布按钮已准备",
        "action": "activate_focused",
    }
    if value == captured:
        return CapturedPublishClick()
    raise ManagedBrowserError("受管发布按钮预检响应无效")
