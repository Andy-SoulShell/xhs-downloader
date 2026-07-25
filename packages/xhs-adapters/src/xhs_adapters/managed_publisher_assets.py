"""加载由扩展源码构建的受管发布页面适配器。"""

from functools import lru_cache
from importlib.resources import files

from xhs_core.domain import ManagedBrowserError

_ASSET_NAME = "managed_publisher_adapter.js"


@lru_cache(maxsize=1)
def load_managed_publisher_adapter() -> str:
    """读取随 Python 包交付的受管发布页面适配器。

    Returns:
        必须在创作页导航前注册的 JavaScript 源码。

    Raises:
        ManagedBrowserError: 构建产物缺失、为空或协议入口缺失。
    """
    try:
        source = (
            files("xhs_adapters")
            .joinpath("browser_assets", _ASSET_NAME)
            .read_text(encoding="utf-8")
        )
    except (FileNotFoundError, OSError) as error:
        raise ManagedBrowserError("受管发布页面适配器尚未构建") from error
    if (
        not source.strip()
        or "__XHS_DOWNLOADER_MANAGED_PUBLISHER_ADAPTER__" not in source
    ):
        raise ManagedBrowserError("受管发布页面适配器内容无效")
    return source
