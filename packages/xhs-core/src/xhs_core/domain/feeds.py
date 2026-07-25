"""小红书浏览结果的结构化领域模型。"""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, HttpUrl


class BrowserAccount(BaseModel):
    """浏览器当前登录账号的最小公开信息。"""

    model_config = ConfigDict(extra="forbid")

    logged_in: bool
    user_id: str | None = None
    nickname: str | None = None


class FeedAuthor(BaseModel):
    """Feed 卡片和评论使用的作者信息。"""

    model_config = ConfigDict(extra="forbid")

    user_id: str = Field(min_length=1, max_length=128)
    nickname: str = Field(default="", max_length=200)
    avatar_url: HttpUrl | None = None


class FeedMetrics(BaseModel):
    """平台展示的互动状态和计数字符串。"""

    model_config = ConfigDict(extra="forbid")

    liked: bool = False
    liked_count: str = "0"
    collected: bool = False
    collected_count: str = "0"
    comment_count: str = "0"
    shared_count: str = "0"


class FeedSummary(BaseModel):
    """推荐、搜索和用户主页中的帖子摘要。"""

    model_config = ConfigDict(extra="forbid")

    feed_id: str = Field(min_length=1, max_length=128)
    xsec_token: str = Field(default="", max_length=2048, repr=False)
    title: str = Field(default="", max_length=500)
    note_type: Literal["image", "video", "unknown"] = "unknown"
    author: FeedAuthor
    metrics: FeedMetrics = Field(default_factory=FeedMetrics)
    cover_url: HttpUrl | None = None
    cover_width: int | None = Field(default=None, ge=0)
    cover_height: int | None = Field(default=None, ge=0)
    video_duration: int | None = Field(default=None, ge=0)


class FeedListResult(BaseModel):
    """首页推荐或搜索任务的分页结果。"""

    model_config = ConfigDict(extra="forbid")

    items: list[FeedSummary] = Field(default_factory=list, max_length=200)
    source: Literal["home", "search"]
    keyword: str | None = Field(default=None, max_length=200)


class FeedComment(BaseModel):
    """帖子下的一条一级评论或回复。"""

    model_config = ConfigDict(extra="forbid")

    comment_id: str = Field(min_length=1, max_length=128)
    content: str = Field(default="", max_length=5000)
    author: FeedAuthor
    liked: bool = False
    like_count: str = "0"
    created_at: int | None = Field(default=None, ge=0)
    ip_location: str = Field(default="", max_length=200)
    reply_count: str = "0"
    replies: list["FeedComment"] = Field(default_factory=list, max_length=200)


class FeedDetailResult(BaseModel):
    """帖子详情、媒体与已加载评论。"""

    model_config = ConfigDict(extra="forbid")

    feed_id: str = Field(min_length=1, max_length=128)
    xsec_token: str = Field(default="", max_length=2048, repr=False)
    title: str = Field(default="", max_length=500)
    body: str = Field(default="", max_length=20000)
    note_type: Literal["image", "video", "unknown"] = "unknown"
    author: FeedAuthor
    metrics: FeedMetrics = Field(default_factory=FeedMetrics)
    image_urls: list[HttpUrl] = Field(default_factory=list, max_length=100)
    published_at: int | None = Field(default=None, ge=0)
    ip_location: str = Field(default="", max_length=200)
    comments: list[FeedComment] = Field(default_factory=list, max_length=500)
    comments_has_more: bool = False
    comments_cursor: str = Field(default="", max_length=2048)


class ProfileMetric(BaseModel):
    """用户主页展示的一项统计值。"""

    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=100)
    count: str = Field(default="0", max_length=100)
    metric_type: str = Field(default="", max_length=100)


class UserProfileResult(BaseModel):
    """指定用户或当前登录账号的主页数据。"""

    model_config = ConfigDict(extra="forbid")

    user_id: str | None = Field(default=None, max_length=128)
    nickname: str = Field(default="", max_length=200)
    red_id: str = Field(default="", max_length=200)
    description: str = Field(default="", max_length=5000)
    avatar_url: HttpUrl | None = None
    ip_location: str = Field(default="", max_length=200)
    metrics: list[ProfileMetric] = Field(default_factory=list, max_length=20)
    feeds: list[FeedSummary] = Field(default_factory=list, max_length=500)
