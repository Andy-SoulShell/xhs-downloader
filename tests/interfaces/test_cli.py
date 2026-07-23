"""Typer 命令行接口测试。"""

from pathlib import Path

import pytest
from typer.testing import CliRunner

from src.interfaces.cli import app
from src.version import VERSION
from tests.interfaces.helpers import FakeService


def test_cli_help_and_version_use_chinese_text() -> None:
    """确保 CLI 帮助采用中文固定文案并报告当前版本。"""
    runner = CliRunner()

    help_result = runner.invoke(app, ["--help"])
    version_result = runner.invoke(app, ["version"])

    assert help_result.exit_code == 0
    assert "用法:" in help_result.output
    assert "选项" in help_result.output
    assert "命令" in help_result.output
    assert "显示帮助并退出。" in help_result.output
    assert version_result.output.strip() == f"xhs-downloader {VERSION}"


def test_cli_detail_and_download_commands(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """确保详情与下载命令调用应用服务并输出结果。

    Args:
        tmp_path: Pytest 提供的临时目录。
        monkeypatch: Pytest 提供的替换工具。
    """
    service = FakeService(with_artifact=True)
    monkeypatch.setattr(
        "src.interfaces.cli.create_service",
        lambda settings: service,
    )
    runner = CliRunner()
    url = "https://www.xiaohongshu.com/explore/synthetic-work"

    detail = runner.invoke(app, ["detail", url])
    download = runner.invoke(
        app,
        ["download", url, "--index", "1", "--force", "--output", str(tmp_path)],
    )

    assert detail.exit_code == 0
    assert '"作品ID": "synthetic-work"' in detail.output
    assert download.exit_code == 0
    assert "SHA-256" in download.output
    assert service.download_arguments[:3] == (url, {1}, True)


def test_cli_reports_domain_errors(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """确保领域异常转为简洁的命令行错误。

    Args:
        monkeypatch: Pytest 提供的替换工具。
    """
    monkeypatch.setattr(
        "src.interfaces.cli.create_service",
        lambda settings: FakeService(fail=True),
    )

    result = CliRunner().invoke(
        app,
        ["detail", "https://www.xiaohongshu.com/explore/synthetic-work"],
    )

    assert result.exit_code == 1
    assert "错误：合成接口错误" in result.output
