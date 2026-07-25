"""xhs-downloader 桌面包的 PyInstaller 规格。"""

# PyInstaller 在执行规格文件时注入构建类。
# ruff: noqa: F821

import sys
from pathlib import Path

from PyInstaller.utils.hooks import collect_data_files, collect_submodules
from xhs_core.version import VERSION

ROOT = Path.cwd()
WEBUI = ROOT / "apps" / "webui" / "dist"

datas = [(str(WEBUI), "webui")]
datas += collect_data_files("playwright")
datas += collect_data_files("xhs_adapters")
hiddenimports = collect_submodules("playwright")

analysis = Analysis(
    [str(ROOT / "packaging" / "desktop_entry.py")],
    pathex=[
        str(ROOT / "apps" / "api" / "src"),
        str(ROOT / "packages" / "xhs-adapters" / "src"),
        str(ROOT / "packages" / "xhs-core" / "src"),
    ],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["pytest", "ruff"],
    noarchive=False,
    optimize=1,
)
pyz = PYZ(analysis.pure)
executable = EXE(
    pyz,
    analysis.scripts,
    [],
    exclude_binaries=True,
    name="xhs-downloader",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,
)
collection = COLLECT(
    executable,
    analysis.binaries,
    analysis.datas,
    strip=False,
    upx=False,
    name="xhs-downloader",
)
if sys.platform == "darwin":
    application = BUNDLE(
        collection,
        name="xhs-downloader.app",
        bundle_identifier="io.github.xhs-downloader.desktop",
        info_plist={
            "CFBundleDisplayName": "xhs-downloader",
            "CFBundleShortVersionString": VERSION,
            "CFBundleVersion": VERSION,
            "LSMinimumSystemVersion": "13.5",
            "NSHighResolutionCapable": True,
        },
    )
