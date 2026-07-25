"""应用可预期异常。"""


class XhsError(Exception):
    """应用异常基类。"""


class InvalidLinkError(XhsError):
    """输入内容中没有受支持的小红书作品链接。"""


class ParseError(XhsError):
    """页面缺少有效作品数据或数据结构不受支持。"""


class TaskStateError(XhsError):
    """下载任务状态不允许当前操作。"""


class SettingsError(XhsError):
    """配置内容无效或无法安全持久化。"""


class PublicationError(XhsError):
    """发布草稿、素材或任务状态无效。"""


class BrowserTaskError(XhsError):
    """浏览器任务提交或执行失败。"""


class DownloadError(XhsError):
    """媒体请求或文件落盘失败。"""


class InvalidPartialContentError(DownloadError):
    """远端拒绝当前断点位置，需要从头下载。"""
