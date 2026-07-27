"""受管 Chromium 启动参数测试。"""

from pathlib import Path

from xhs_adapters.chromium_process import (
    build_launch_command,
    build_user_agent,
    parse_major_version,
)


def _command(
    headless: bool = False,
    offscreen: bool = False,
    user_agent: str | None = None,
) -> tuple[str, ...]:
    return build_launch_command(
        Path("/synthetic/chromium"),
        Path("/synthetic/profile"),
        headless,
        offscreen,
        user_agent,
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


def test_headless_carries_a_user_agent_without_the_headless_token() -> None:
    """无头时必须能覆盖 UA; 小红书就是靠 HeadlessChrome 这个词判定的。"""
    agent = build_user_agent("150", "darwin")
    command = _command(headless=True, user_agent=agent)

    assert f"--user-agent={agent}" in command
    assert "HeadlessChrome" not in agent
    assert "Chrome/150.0.0.0" in agent


def test_visible_window_never_overrides_the_user_agent() -> None:
    """有头时浏览器自报的 UA 本来就是正常的, 不需要也不应该改。"""
    command = _command(user_agent=build_user_agent("150", "darwin"))

    assert not any(item.startswith("--user-agent") for item in command)


def test_user_agent_follows_the_platform() -> None:
    """三个平台各自的标识不能混用。"""
    assert "Macintosh" in build_user_agent("150", "darwin")
    assert "Windows NT" in build_user_agent("150", "win32")
    assert "Linux" in build_user_agent("150", "freebsd14")


def test_major_version_comes_from_the_browser_itself() -> None:
    """版本号问浏览器要, 免得写死之后对不上真实安装。"""
    assert parse_major_version("Google Chrome 150.0.7871.182 ") == "150"
    assert parse_major_version("Chromium 131.0.6778.86") == "131"
    assert parse_major_version("看不出版本") is None
