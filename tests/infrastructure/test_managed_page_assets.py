"""受管浏览器页面适配器资源基础设施测试。"""

from xhs_adapters.managed_page_assets import load_managed_page_adapter


def test_managed_page_adapter_asset_is_packaged_and_loadable() -> None:
    """确保共享页面适配器构建产物随 Python 包存在且可以加载。"""
    source = load_managed_page_adapter()

    assert source.strip()
    assert "__XHS_DOWNLOADER_MANAGED_PAGE_ADAPTER__" in source
    assert 'MANAGED_PAGE_ADAPTER_VERSION = "3"' in source
    assert "proveAccount" in source
    assert "由 apps/extension/build.mjs 生成" in source
