"""旧版 HTTP 详情 Provider 的兼容导入。"""

from .http_read_provider import HttpReadProvider

HttpFeedDetailProvider = HttpReadProvider

__all__ = ["HttpFeedDetailProvider"]
