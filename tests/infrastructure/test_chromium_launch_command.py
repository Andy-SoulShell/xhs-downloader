"""受管 Chromium 启动参数测试。"""

from pathlib import Path

from xhs_adapters.chromium_process import build_launch_command


def _command(headless: bool = False, offscreen: bool = False) -> tuple[str, ...]:
    return build_launch_command(
        Path("/synthetic/chromium"),
        Path("/synthetic/profile"),
        headless,
        offscreen,
    )


def test_visible_window_adds_no_extra_flag() -> None:
    """默认既不无头也不挪窗口。"""
    command = _command()

    assert "--headless=new" not in command
    assert not any(item.startswith("--window-position") for item in command)


def test_headless_hides_the_window() -> None:
    """无头模式加 --headless=new。"""
    assert "--headless=new" in _command(headless=True)


def test_offscreen_moves_the_window_out_of_view() -> None:
    """挪出可视区用一个远超任何屏幕排布的负坐标。"""
    command = _command(offscreen=True)

    assert "--window-position=-32000,-32000" in command
    assert "--headless=new" not in command


def test_headless_wins_over_offscreen() -> None:
    """无头时窗口根本不存在; 再给窗口坐标只会自相矛盾。"""
    command = _command(headless=True, offscreen=True)

    assert "--headless=new" in command
    assert not any(item.startswith("--window-position") for item in command)


def test_profile_stays_isolated_and_debugging_is_loopback_only() -> None:
    """无论窗口怎么显示, 专用目录与回环调试端口都不能变。"""
    for command in (_command(), _command(headless=True), _command(offscreen=True)):
        assert "--user-data-dir=/synthetic/profile" in command
        assert "--remote-debugging-address=127.0.0.1" in command
