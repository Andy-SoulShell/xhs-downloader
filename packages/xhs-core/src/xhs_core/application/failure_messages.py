"""把下载异常翻译成用户能据以行动的中文说明。"""

import errno
import re
from ssl import SSLError

import httpx

SENSITIVE_QUERY = re.compile(r"(https?://[^?\s]+)\?\S+")
"""带签名参数的地址；日志与提示中只保留路径部分。"""

_MAXIMUM_LENGTH = 1000

_UNKNOWN_MESSAGE = "下载失败，请稍后重试。"
_CHINESE = re.compile(r"[一-鿿]")


def describe_download_failure(error: Exception) -> str:
    """给出面向用户的失败原因和下一步动作。

    异常原文多为英文，且常带有本机绝对路径或带签名的媒体地址，既看不懂也不该
    展示。这里按常见成因归类，只输出可据以行动的说明。

    Args:
        error: 下载执行过程中捕获的异常。

    Returns:
        中文失败说明；无法归类时返回通用兜底文案。
    """
    if isinstance(error, PermissionError):
        return "下载目录没有写入权限，请在设置里换一个目录，或修改该目录的权限后重试。"
    if isinstance(error, IsADirectoryError):
        return "下载目标被一个同名目录占用，请在设置里换一个目录后重试。"
    if isinstance(error, OSError) and error.errno is not None:
        message = _describe_os_error(error.errno)
        if message:
            return message
    if isinstance(error, httpx.HTTPStatusError):
        return _describe_http_status(error.response.status_code)
    if isinstance(error, httpx.TimeoutException):
        return "下载超时，可能是网络不稳定，请稍后重试。"
    if isinstance(error, SSLError | httpx.ConnectError):
        return "连不上小红书的媒体服务器，请检查网络或代理设置后重试。"
    if isinstance(error, httpx.TransportError):
        return "下载过程中网络中断，请重试。"
    return _fallback(error)


def _describe_os_error(code: int) -> str | None:
    """把文件系统错误码翻译成具体说明。"""
    if code == errno.EACCES or code == errno.EPERM:
        return "下载目录没有写入权限，请在设置里换一个目录，或修改该目录的权限后重试。"
    if code == errno.ENOSPC:
        return "磁盘空间不足，清理后再重试。"
    if code == errno.EROFS:
        return "下载目录位于只读磁盘上，请在设置里换一个可写目录。"
    if code == errno.ENOENT:
        return "下载目录不存在或已被移除，请在设置里重新指定。"
    if code == errno.ENAMETOOLONG:
        return "文件名超出系统上限，请在设置里改用更短的命名格式。"
    if code == errno.EDQUOT:
        return "已达到磁盘配额上限，清理后再重试。"
    return None


def _describe_http_status(status_code: int) -> str:
    """把媒体请求的状态码翻译成具体说明。"""
    if status_code in {401, 403}:
        return "媒体地址已失效或需要登录，请重新解析这个帖子后再下载。"
    if status_code == 404:
        return "媒体已被作者删除或设为不可见。"
    if status_code == 429:
        return "请求过于频繁被限流，稍等一会儿再重试。"
    if status_code >= 500:
        return "小红书的媒体服务器暂时异常，请稍后重试。"
    return "媒体地址返回了异常状态，请重新解析这个帖子后再下载。"


def _fallback(error: Exception) -> str:
    """无法归类时的兜底：只透出本身就是中文的说明。"""
    message = str(error).strip()
    if not message or not _CHINESE.search(message):
        return _UNKNOWN_MESSAGE
    return SENSITIVE_QUERY.sub(r"\1?<redacted>", message)[:_MAXIMUM_LENGTH]
