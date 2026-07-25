"""macOS 发行门禁测试。"""

import pytest

from scripts.macos_distribution import (
    notarize_macos_bundle,
    sign_macos_bundle,
)


def test_unsigned_build_is_explicitly_a_preview(monkeypatch, tmp_path) -> None:
    """确保没有开发者身份时不会冒充正式发行包。

    Args:
        monkeypatch: Pytest 提供的环境替换工具。
        tmp_path: Pytest 提供的临时目录。
    """
    monkeypatch.delenv("XHS_BUILD_MACOS_SIGN_IDENTITY", raising=False)

    assert sign_macos_bundle(tmp_path.joinpath("synthetic.app")) == (
        "development_preview"
    )


def test_notarization_requires_signing_identity(monkeypatch, tmp_path) -> None:
    """确保公证配置不能绕过 Developer ID 签名。

    Args:
        monkeypatch: Pytest 提供的环境替换工具。
        tmp_path: Pytest 提供的临时目录。
    """
    monkeypatch.setenv("XHS_BUILD_MACOS_NOTARY_PROFILE", "synthetic-profile")
    monkeypatch.delenv("XHS_BUILD_MACOS_SIGN_IDENTITY", raising=False)

    with pytest.raises(RuntimeError, match="Developer ID"):
        notarize_macos_bundle(
            tmp_path.joinpath("synthetic.app"),
            tmp_path.joinpath("synthetic.zip"),
        )
