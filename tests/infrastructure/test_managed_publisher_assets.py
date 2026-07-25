"""受管发布页面适配器资源测试。"""

from xhs_adapters.managed_publisher_assets import load_managed_publisher_adapter


def test_managed_publisher_adapter_asset_is_packaged_and_loadable() -> None:
    """确保受管发布构建产物随 Python 包交付且包含固定协议入口。"""
    source = load_managed_publisher_adapter()

    assert source.strip()
    assert "__XHS_DOWNLOADER_MANAGED_PUBLISHER_ADAPTER__" in source
    assert "data-xhd-managed-upload" in source
    assert "data-xhd-managed-publish" in source
    assert "由 apps/extension/build.mjs 生成" in source
