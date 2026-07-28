"""受管浏览器发布流程。

对外只暴露执行器与创作页选择器：前者是唯一入口，后者是测试与流程共用的
页面契约。其余模块（页面协议、分步流程、观测解析、素材校验）都是本包内部
实现，加下划线前缀标明，不参与跨包引用。
"""

from ._contract import PUBLISH_SELECTOR, SCHEDULE_SELECTOR, UPLOAD_SELECTOR
from .executor import PlaywrightManagedPublicationExecutor

__all__ = [
    "PUBLISH_SELECTOR",
    "SCHEDULE_SELECTOR",
    "UPLOAD_SELECTOR",
    "PlaywrightManagedPublicationExecutor",
]
