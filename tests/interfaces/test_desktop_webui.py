"""桌面路径与同源 WebUI 测试。"""

from pathlib import Path

from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from xhs_api.desktop_paths import prepare_desktop_paths
from xhs_api.webui import mount_webui


def _build_webui(path: Path) -> Path:
    path.mkdir()
    path.joinpath("index.html").write_text(
        "<!doctype html><title>合成管理界面</title>",
        encoding="utf-8",
    )
    path.joinpath("app.js").write_text("export {};", encoding="utf-8")
    assets = path.joinpath("assets")
    assets.mkdir()
    assets.joinpath("app-synthetic.js").write_text(
        "export {};",
        encoding="utf-8",
    )
    return path


def test_desktop_paths_survive_application_replacement(tmp_path: Path) -> None:
    """确保配置和数据位于程序包之外，并初始化默认数据目录。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    config = tmp_path.joinpath("config")
    data = tmp_path.joinpath("data")
    webui = _build_webui(tmp_path.joinpath("webui"))

    paths = prepare_desktop_paths(
        config_dir=config,
        data_dir=data,
        webui_dir=webui,
    )
    second = prepare_desktop_paths(
        config_dir=config,
        data_dir=data,
        webui_dir=webui,
    )

    assert paths == second
    assert paths.config_file.read_text(encoding="utf-8") == (
        f'XHS_WORK_PATH="{data}"\nXHS_SERVER_HOST="127.0.0.1"\nXHS_SERVER_PORT=5556\n'
    )
    assert paths.data_dir == data


async def test_webui_is_served_over_http_with_navigation_fallback(
    tmp_path: Path,
) -> None:
    """确保桌面界面、资源及页面导航均通过 HTTP 提供。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    webui = _build_webui(tmp_path.joinpath("webui"))
    api = FastAPI()
    mount_webui(api, webui)

    async with AsyncClient(
        transport=ASGITransport(app=api),
        base_url="http://127.0.0.1",
    ) as client:
        index = await client.get("/ui/")
        navigation = await client.get(
            "/ui/settings",
            headers={"Accept": "text/html"},
        )
        asset = await client.get("/ui/assets/app-synthetic.js")
        unhashed_asset = await client.get("/ui/app.js")
        missing_asset = await client.get("/ui/missing.js")

    assert index.status_code == 200
    assert "合成管理界面" in index.text
    assert index.headers["cache-control"] == "no-cache"
    assert navigation.text == index.text
    assert navigation.headers["cache-control"] == "no-cache"
    assert asset.headers["content-type"].startswith("text/javascript")
    assert asset.headers["cache-control"] == ("public, max-age=31536000, immutable")
    assert unhashed_asset.headers["cache-control"] == "no-cache"
    assert missing_asset.status_code == 404


def test_webui_requires_a_complete_build(tmp_path: Path) -> None:
    """确保缺失入口文件时拒绝启动。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    api = FastAPI()

    try:
        mount_webui(api, tmp_path)
    except RuntimeError as error:
        assert "WebUI 构建不完整" in str(error)
    else:
        raise AssertionError("不完整 WebUI 不应被挂载")
