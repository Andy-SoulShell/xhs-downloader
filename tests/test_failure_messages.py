"""下载失败说明的归类测试。"""

import errno

import httpx
import pytest
from xhs_core.application.failure_messages import describe_download_failure


def test_permission_error_points_at_the_download_directory() -> None:
    """目录不可写时要指向设置里的目录，而不是抛出系统原文。"""
    error = PermissionError(errno.EACCES, "Permission denied", "/Users/someone/下载")

    message = describe_download_failure(error)

    assert "写入权限" in message
    # 系统原文是英文且带本机绝对路径, 两者都不该出现在提示里
    assert "Permission denied" not in message
    assert "/Users/someone" not in message


def test_disk_full_is_distinguished_from_permission() -> None:
    """磁盘满和没权限的处理动作完全不同，不能混为一谈。"""
    error = OSError(errno.ENOSPC, "No space left on device")

    assert "磁盘空间不足" in describe_download_failure(error)


@pytest.mark.parametrize(
    ("code", "expected"),
    [
        (errno.EROFS, "只读磁盘"),
        (errno.ENOENT, "不存在"),
        (errno.ENAMETOOLONG, "命名格式"),
    ],
)
def test_file_system_errors_map_to_specific_actions(code: int, expected: str) -> None:
    """常见文件系统错误各自给出具体动作。

    Args:
        code: 待翻译的 errno 错误码。
        expected: 提示中必须出现的关键词。
    """
    assert expected in describe_download_failure(OSError(code, "boom"))


@pytest.mark.parametrize(
    ("status_code", "expected"),
    [
        (403, "重新解析"),
        (404, "删除"),
        (429, "限流"),
        (503, "稍后重试"),
    ],
)
def test_http_status_maps_to_user_action(status_code: int, expected: str) -> None:
    """媒体地址带签名会过期，状态码要翻译成用户能做的事。

    Args:
        status_code: 媒体请求返回的 HTTP 状态码。
        expected: 提示中必须出现的关键词。
    """
    request = httpx.Request("GET", "https://example.invalid/media.jpg")
    response = httpx.Response(status_code, request=request)
    error = httpx.HTTPStatusError("boom", request=request, response=response)

    assert expected in describe_download_failure(error)


def test_network_errors_are_separated_by_cause() -> None:
    """超时、连不上和传输中断对应的排查方向不同。"""
    request = httpx.Request("GET", "https://example.invalid/media.jpg")

    assert "超时" in describe_download_failure(
        httpx.ReadTimeout("boom", request=request)
    )
    assert "网络或代理" in describe_download_failure(
        httpx.ConnectError("boom", request=request)
    )
    assert "网络中断" in describe_download_failure(
        httpx.ReadError("boom", request=request)
    )


def test_unclassified_english_errors_fall_back_instead_of_leaking() -> None:
    """未归类的英文运行时错误对用户没有意义，不能原样展示。"""
    message = describe_download_failure(RuntimeError("Something exploded in module X"))

    assert message == "下载失败，请稍后重试。"


def test_chinese_messages_pass_through_with_signed_urls_redacted() -> None:
    """本身就是中文的说明保留，但带签名的地址必须抹掉查询串。"""
    error = RuntimeError(
        "解析失败：https://example.invalid/media.jpg?sign=abc&expire=123"
    )

    message = describe_download_failure(error)

    assert message.startswith("解析失败：")
    assert "sign=abc" not in message
    assert "<redacted>" in message
