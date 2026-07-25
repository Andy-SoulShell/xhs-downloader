"""浏览器扩展权限边界测试。"""

from json import loads
from pathlib import Path

ROOT = Path(__file__).parents[1]
MANIFEST = ROOT.joinpath("apps", "extension", "manifest.json")


def test_extension_uses_minimum_permissions() -> None:
    """确保扩展只申请发布与下载所需权限，不开放 Cookie 或全站访问。"""
    manifest = loads(MANIFEST.read_text(encoding="utf-8"))
    permissions = set(manifest["permissions"])
    host_permissions = set(manifest["host_permissions"])

    assert permissions == {
        "activeTab",
        "alarms",
        "debugger",
        "downloads",
        "storage",
    }
    assert "cookies" not in permissions
    assert "webRequest" not in permissions
    assert host_permissions == {
        "http://127.0.0.1/*",
        "http://localhost/*",
    }
    assert all("<all_urls>" not in value for value in host_permissions)


def test_extension_only_runs_on_supported_post_pages() -> None:
    """确保内容脚本只注入受支持的小红书帖子页面。"""
    manifest = loads(MANIFEST.read_text(encoding="utf-8"))
    content_scripts = manifest["content_scripts"]
    matches = content_scripts[0]["matches"]

    assert matches == [
        "https://www.xiaohongshu.com/explore/*",
        "https://www.xiaohongshu.com/discovery/item/*",
    ]
    assert content_scripts[1]["matches"] == ["https://creator.xiaohongshu.com/*"]
    assert content_scripts[3] == {
        "matches": ["https://www.xiaohongshu.com/*"],
        "js": ["browser-page.js"],
        "run_at": "document_idle",
    }
