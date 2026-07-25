"""受管发布执行器依赖的最小 Playwright 页面类型边界。"""

from collections.abc import Sequence
from typing import Any, Protocol

from .managed_page_session import ManagedPage


class ManagedPublicationKeyboard(Protocol):
    """填写官方定时控件的浏览器键盘。"""

    async def press(self, key: str, **options: Any) -> None:
        """发送不包含用户正文的固定控制按键。

        Args:
            key: Playwright 按键名称。
            **options: Playwright 按键选项。
        """
        ...

    async def insert_text(self, text: str) -> None:
        """插入已经由 Python 独立复核的官方定时时间。

        Args:
            text: 北京时间格式的固定长度时间文本。
        """
        ...


class ManagedPublicationPage(ManagedPage, Protocol):
    """上传素材、填写官方定时并可信提交发布的页面接口。"""

    @property
    def keyboard(self) -> ManagedPublicationKeyboard:
        """返回绑定当前页面的浏览器键盘。

        Returns:
            仅用于官方定时输入的键盘接口。
        """
        ...

    async def add_init_script(self, script: str) -> None:
        """注册在后续导航文档脚本之前执行的页面适配器。

        Args:
            script: 由扩展源码生成的固定适配器源码。
        """
        ...

    async def set_input_files(
        self,
        selector: str,
        files: Sequence[str],
        **options: Any,
    ) -> None:
        """通过固定文件输入框上传已校验素材。

        Args:
            selector: 页面适配器标记的固定上传选择器。
            files: 按发布位置排序的素材绝对路径。
            **options: Playwright 严格匹配和等待上限。
        """
        ...
