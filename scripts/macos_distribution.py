"""macOS 正式发行签名与公证步骤。"""

import json
import os
import subprocess
from pathlib import Path

_IDENTITY_VARIABLE = "XHS_BUILD_MACOS_SIGN_IDENTITY"
_NOTARY_VARIABLE = "XHS_BUILD_MACOS_NOTARY_PROFILE"


def sign_macos_bundle(bundle: Path) -> str:
    """按构建环境签名 macOS 应用。

    Args:
        bundle: PyInstaller 生成的 ``.app`` 路径。

    Returns:
        ``development_preview`` 或 ``signed`` 发行状态。
    """
    if os.name != "posix" or not bundle.name.endswith(".app"):
        return "development_preview"
    identity = os.environ.get(_IDENTITY_VARIABLE)
    if not identity:
        return "development_preview"
    _run(
        [
            "codesign",
            "--force",
            "--deep",
            "--options",
            "runtime",
            "--timestamp",
            "--sign",
            identity,
            str(bundle),
        ]
    )
    _run(["codesign", "--verify", "--deep", "--strict", str(bundle)])
    return "signed"


def notarize_macos_bundle(bundle: Path, archive: Path) -> bool:
    """提交已签名归档、公证并把票据装订回应用。

    Args:
        bundle: 已使用 Developer ID 签名的应用。
        archive: 使用 ``ditto`` 生成的待公证 ZIP。

    Returns:
        配置公证凭据并完成装订时返回真。

    Raises:
        RuntimeError: 配置了公证凭据但没有签名身份。
    """
    profile = os.environ.get(_NOTARY_VARIABLE)
    if not profile:
        return False
    if not os.environ.get(_IDENTITY_VARIABLE):
        raise RuntimeError("配置 macOS 公证前必须提供 Developer ID 签名身份")
    result = subprocess.run(
        [
            "xcrun",
            "notarytool",
            "submit",
            str(archive),
            "--keychain-profile",
            profile,
            "--wait",
            "--output-format",
            "json",
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    payload = json.loads(result.stdout)
    if payload.get("status") != "Accepted":
        raise RuntimeError("Apple 公证未返回 Accepted 状态")
    _run(["xcrun", "stapler", "staple", str(bundle)])
    _run(["xcrun", "stapler", "validate", str(bundle)])
    return True


def _run(command: list[str]) -> None:
    subprocess.run(command, check=True)
