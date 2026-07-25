"""桌面启动错误提示测试。"""

from xhs_api.desktop_error import show_startup_error


def test_linux_startup_error_falls_back_to_stderr(
    monkeypatch,
    capsys,
) -> None:
    """确保无图形提示工具时仍输出脱敏错误。

    Args:
        monkeypatch: Pytest 提供的属性替换工具。
        capsys: Pytest 提供的标准流捕获工具。
    """
    import xhs_api.desktop_error as error_module

    monkeypatch.setattr(error_module.sys, "platform", "linux")
    monkeypatch.setattr(error_module.shutil, "which", lambda _: None)

    show_startup_error("端口 5556 已被占用\n请关闭其他程序")

    assert capsys.readouterr().err == (
        "xhs-downloader 无法启动：端口 5556 已被占用 请关闭其他程序\n"
    )
