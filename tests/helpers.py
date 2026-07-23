"""测试数据构造工具。"""

from datetime import UTC, datetime

from src.domain import Author, MediaKind, MediaResource, WorkDetail, WorkType


def make_detail(
    source_url: str = "https://www.xiaohongshu.com/explore/synthetic-work",
    media: list[MediaResource] | None = None,
) -> WorkDetail:
    """构造不依赖真实小红书数据的作品。

    Args:
        source_url: 作品来源地址。
        media: 可选的媒体资源列表。

    Returns:
        字段完整的合成作品。
    """
    return WorkDetail(
        work_id="synthetic-work",
        source_url=source_url,
        title="合成/测试:作品",
        description="完全合成的测试文本",
        work_type=WorkType.VIDEO,
        published_at=datetime(2024, 1, 2, 3, 4, 5, tzinfo=UTC),
        author=Author(
            author_id="synthetic-author",
            nickname="合成作者",
            profile_url="https://example.invalid/author",
        ),
        media=media
        if media is not None
        else [
            MediaResource(
                index=1,
                kind=MediaKind.VIDEO,
                url="https://example.invalid/synthetic.mp4",
                suffix="mp4",
            )
        ],
    )
