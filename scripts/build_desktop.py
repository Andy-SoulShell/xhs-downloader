"""构建、冒烟验证并封装桌面版与浏览器扩展。"""

import hashlib
import json
import os
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

from xhs_core.version import VERSION

from scripts.macos_distribution import (
    notarize_macos_bundle,
    sign_macos_bundle,
)
from scripts.release_archives import (
    archive_desktop,
    desktop_archive_name,
    extract_desktop_archive,
    platform_tag,
    verify_archive_contents,
    zip_tree,
)

ROOT = Path(__file__).resolve().parents[1]
BUILD_ROOT = ROOT.joinpath("build", "desktop")
DIST_ROOT = BUILD_ROOT.joinpath("dist")
RELEASE_ROOT = ROOT.joinpath("build", "releases", VERSION)


def main() -> None:
    """执行可复现构建、HTTP 冒烟验证和校验文件生成。"""
    _build_web_assets()
    _run(
        [
            "uv",
            "run",
            "pyinstaller",
            "--noconfirm",
            "--clean",
            "--distpath",
            str(DIST_ROOT),
            "--workpath",
            str(BUILD_ROOT.joinpath("work")),
            str(ROOT.joinpath("packaging", "xhs-downloader.spec")),
        ]
    )
    executable, bundle = _desktop_artifact()
    distribution = sign_macos_bundle(bundle)
    _smoke_test(executable)
    RELEASE_ROOT.mkdir(parents=True, exist_ok=True)
    desktop_archive = RELEASE_ROOT.joinpath(desktop_archive_name(VERSION))
    extension_archive = RELEASE_ROOT.joinpath(f"xhs-downloader-extension-{VERSION}.zip")
    archive_desktop(bundle, desktop_archive)
    if notarize_macos_bundle(bundle, desktop_archive):
        archive_desktop(bundle, desktop_archive)
        distribution = "notarized"
    zip_tree(
        ROOT.joinpath("apps", "extension", "dist"),
        extension_archive,
        root_name="xhs-downloader-extension",
    )
    verify_archive_contents(desktop_archive, extension_archive)
    _smoke_test_archive(
        desktop_archive,
        distribution=distribution,
    )
    _write_manifest(
        [desktop_archive, extension_archive],
        distribution=distribution,
    )
    print(f"发布产物已生成：{RELEASE_ROOT}")


def _build_web_assets() -> None:
    environment = os.environ.copy()
    environment.update(
        {
            "VITE_API_BASE": "",
            "VITE_BASE_PATH": "/ui/",
        }
    )
    _run(
        ["pnpm", "--filter", "xhs-downloader-webui", "build"],
        environment,
    )
    _run(["pnpm", "--filter", "xhs-downloader-extension", "build"])


def _desktop_artifact() -> tuple[Path, Path]:
    if sys.platform == "darwin":
        bundle = DIST_ROOT.joinpath("xhs-downloader.app")
        executable = bundle.joinpath("Contents", "MacOS", "xhs-downloader")
    else:
        bundle = DIST_ROOT.joinpath("xhs-downloader")
        suffix = ".exe" if sys.platform == "win32" else ""
        executable = bundle.joinpath(f"xhs-downloader{suffix}")
    if not executable.is_file():
        raise RuntimeError(f"桌面可执行文件不存在：{executable}")
    return executable, bundle


def _smoke_test(executable: Path) -> None:
    port = _free_port()
    with tempfile.TemporaryDirectory(prefix="xhs-desktop-smoke-") as temporary:
        root = Path(temporary)
        environment = os.environ.copy()
        environment["XHS_MANAGED_BROWSER_HEADLESS"] = "true"
        process = subprocess.Popen(
            [
                str(executable),
                "--no-open",
                "--port",
                str(port),
                "--config-dir",
                str(root.joinpath("config")),
                "--data-dir",
                str(root.joinpath("data")),
            ],
            env=environment,
        )
        try:
            deadline = time.monotonic() + 30
            while time.monotonic() < deadline:
                if process.poll() is not None:
                    raise RuntimeError("桌面程序在健康检查前退出")
                try:
                    health = _read_url(f"http://127.0.0.1:{port}/health")
                    page = _read_url(f"http://127.0.0.1:{port}/ui/")
                except OSError:
                    time.sleep(0.2)
                    continue
                if b'"status":"ok"' in health and b"<html" in page.lower():
                    _smoke_managed_browser(port)
                    return
                time.sleep(0.2)
            raise RuntimeError("桌面程序 HTTP 冒烟验证超时")
        finally:
            process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)


def _smoke_managed_browser(port: int) -> None:
    base_url = f"http://127.0.0.1:{port}/browser/managed"
    initial = _request_json(f"{base_url}/status")
    if initial.get("state") != "stopped":
        raise RuntimeError("受管浏览器初始状态不是 stopped")
    if initial.get("installed") is not True:
        if initial.get("installed") is False and initial.get("cdp_port") is None:
            return
        raise RuntimeError("受管浏览器安装检测响应无效")
    try:
        started = _request_json(f"{base_url}/start", method="POST")
        cdp_port = started.get("cdp_port")
        if not (
            started.get("state") == "running"
            and started.get("cdp_host") == "127.0.0.1"
            and isinstance(cdp_port, int)
            and not isinstance(cdp_port, bool)
            and 0 < cdp_port <= 65535
        ):
            raise RuntimeError("受管浏览器没有返回有效的本机 CDP 端点")
        running = _request_json(f"{base_url}/status")
        if running.get("state") != "running" or running.get("cdp_port") != cdp_port:
            raise RuntimeError("受管浏览器运行状态与启动结果不一致")
    finally:
        stopped = _request_json(f"{base_url}/stop", method="POST")
        if stopped.get("state") != "stopped" or stopped.get("cdp_port") is not None:
            raise RuntimeError("受管浏览器没有安全停止")


def _read_url(url: str) -> bytes:
    with urllib.request.urlopen(url, timeout=1) as response:
        return response.read()


def _request_json(url: str, *, method: str = "GET") -> dict[str, object]:
    request = urllib.request.Request(url, method=method)
    with urllib.request.urlopen(request, timeout=30) as response:
        payload = json.loads(response.read())
    if not isinstance(payload, dict):
        raise RuntimeError("桌面程序返回了无效的 JSON 响应")
    return payload


def _free_port() -> int:
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        return int(listener.getsockname()[1])


def _smoke_test_archive(
    archive: Path,
    *,
    distribution: str,
) -> None:
    with tempfile.TemporaryDirectory(prefix="xhs-release-smoke-") as temporary:
        root = Path(temporary)
        executable, bundle = extract_desktop_archive(archive, root)
        if bundle is not None:
            _run(
                [
                    "codesign",
                    "--verify",
                    "--deep",
                    "--strict",
                    str(bundle),
                ]
            )
            if distribution == "notarized":
                _run(["xcrun", "stapler", "validate", str(bundle)])
                _run(
                    [
                        "spctl",
                        "--assess",
                        "--type",
                        "execute",
                        str(bundle),
                    ]
                )
        _smoke_test(executable)


def _write_manifest(
    archives: list[Path],
    *,
    distribution: str,
) -> None:
    artifacts = [
        {
            "file": path.name,
            "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            "size": path.stat().st_size,
        }
        for path in archives
    ]
    manifest = {
        "version": VERSION,
        "platform": platform_tag(),
        "distribution": distribution,
        "artifacts": artifacts,
    }
    RELEASE_ROOT.joinpath("release-manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    RELEASE_ROOT.joinpath("SHA256SUMS").write_text(
        "".join(f"{item['sha256']}  {item['file']}\n" for item in artifacts),
        encoding="utf-8",
    )


def _run(
    command: list[str],
    environment: dict[str, str] | None = None,
) -> None:
    subprocess.run(
        command,
        cwd=ROOT,
        env=environment,
        check=True,
    )


if __name__ == "__main__":
    main()
