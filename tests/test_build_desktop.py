"""桌面构建端到端冒烟辅助逻辑测试。"""

from collections.abc import Iterator

import pytest

from scripts import build_desktop


def test_managed_browser_smoke_runs_installed_lifecycle(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """确保已安装浏览器会完成状态、启动、CDP 与停止验证。

    Args:
        monkeypatch: Pytest 提供的属性替换工具。
    """
    responses: Iterator[dict[str, object]] = iter(
        [
            {"installed": True, "state": "stopped", "cdp_port": None},
            {
                "installed": True,
                "state": "running",
                "cdp_host": "127.0.0.1",
                "cdp_port": 19321,
            },
            {"installed": True, "state": "running", "cdp_port": 19321},
            {"installed": True, "state": "stopped", "cdp_port": None},
        ]
    )
    calls: list[tuple[str, str]] = []

    def request(url: str, *, method: str = "GET") -> dict[str, object]:
        calls.append((url, method))
        return next(responses)

    monkeypatch.setattr(build_desktop, "_request_json", request)

    build_desktop._smoke_managed_browser(5556)

    assert calls == [
        ("http://127.0.0.1:5556/browser/managed/status", "GET"),
        ("http://127.0.0.1:5556/browser/managed/start", "POST"),
        ("http://127.0.0.1:5556/browser/managed/status", "GET"),
        ("http://127.0.0.1:5556/browser/managed/stop", "POST"),
    ]


def test_managed_browser_smoke_accepts_missing_optional_browser(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """确保未安装浏览器时仍验证稳定的停止状态。

    Args:
        monkeypatch: Pytest 提供的属性替换工具。
    """
    monkeypatch.setattr(
        build_desktop,
        "_request_json",
        lambda *_args, **_kwargs: {
            "installed": False,
            "state": "stopped",
            "cdp_port": None,
        },
    )

    build_desktop._smoke_managed_browser(5556)


def test_managed_browser_smoke_stops_after_invalid_cdp(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """确保启动结果异常时仍调用停止并使构建失败。

    Args:
        monkeypatch: Pytest 提供的属性替换工具。
    """
    responses: Iterator[dict[str, object]] = iter(
        [
            {"installed": True, "state": "stopped", "cdp_port": None},
            {
                "installed": True,
                "state": "running",
                "cdp_host": "0.0.0.0",
                "cdp_port": 19321,
            },
            {"installed": True, "state": "stopped", "cdp_port": None},
        ]
    )
    calls: list[str] = []

    def request(url: str, *, method: str = "GET") -> dict[str, object]:
        calls.append(f"{method} {url}")
        return next(responses)

    monkeypatch.setattr(build_desktop, "_request_json", request)

    with pytest.raises(RuntimeError, match="有效的本机 CDP"):
        build_desktop._smoke_managed_browser(5556)

    assert calls[-1].endswith("/browser/managed/stop")
