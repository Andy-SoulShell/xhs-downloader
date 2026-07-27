"""浏览器任务中断归因测试。"""

from xhs_core.domain.browser_interruption import interrupted_browser_task_message
from xhs_core.domain.managed_browser import ManagedBrowserState


def test_read_interruption_names_the_stopped_browser() -> None:
    """浏览器正常停止时说清是停止导致的。"""
    message = interrupted_browser_task_message(
        may_write=False,
        stopped=True,
        browser_state=ManagedBrowserState.STOPPED,
        error=None,
    )

    assert "已停止" in message


def test_read_interruption_points_at_the_start_entry() -> None:
    """浏览器不在运行时给出启动它的确切位置。"""
    message = interrupted_browser_task_message(
        may_write=False,
        stopped=False,
        browser_state=ManagedBrowserState.ERROR,
        error=RuntimeError("页面 https://example.invalid 里的用户文本"),
    )

    assert "连接方式" in message
    # 异常原文可能夹带页面内容与地址; 一律不能出现在用户看到的结论里
    assert "example.invalid" not in message


def test_read_interruption_distinguishes_timeout_from_disconnect() -> None:
    """超时和连接断开是两种不同的处理方式，不能都归成一句通用失败。"""
    timeout = interrupted_browser_task_message(
        may_write=False,
        stopped=False,
        browser_state=ManagedBrowserState.RUNNING,
        error=TimeoutError(),
    )
    disconnected = interrupted_browser_task_message(
        may_write=False,
        stopped=False,
        browser_state=ManagedBrowserState.RUNNING,
        error=ConnectionResetError(),
    )

    assert "没有响应" in timeout
    assert "连接断开" in disconnected
    assert timeout != disconnected


def test_read_interruption_falls_back_without_state_or_error() -> None:
    """状态和异常都拿不到时仍要给一句可执行的结论。"""
    message = interrupted_browser_task_message(
        may_write=False,
        stopped=False,
        browser_state=None,
        error=None,
    )

    assert "可以直接重试" in message


def test_write_interruption_asks_for_manual_check() -> None:
    """可能改变平台状态的任务一律要求人工核对，不引导重试。"""
    stopped = interrupted_browser_task_message(
        may_write=True,
        stopped=True,
        browser_state=ManagedBrowserState.STOPPED,
        error=None,
    )
    failed = interrupted_browser_task_message(
        may_write=True,
        stopped=False,
        browser_state=ManagedBrowserState.RUNNING,
        error=TimeoutError(),
    )

    assert "核对" in stopped
    assert "核对" in failed
    assert "重试" not in stopped
    assert "重试" not in failed
