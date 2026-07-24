"""测试数据构造工具。"""

import json
from datetime import UTC, datetime
from typing import Any

from xhs_core.domain import (
    Author,
    MediaKind,
    MediaResource,
    PublicationAsset,
    PublicationDraft,
    WorkDetail,
    WorkType,
)


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


def make_initial_state_html(
    note: dict[str, Any] | None = None,
    *,
    work_id: str = "synthetic-work",
    phone_layout: bool = False,
) -> str:
    """构造包含页面初始状态的合成 HTML。

    Args:
        note: 覆盖默认作品对象。
        work_id: 初始状态中的作品 ID。
        phone_layout: 是否采用移动端状态结构。

    Returns:
        可由真实页面解析器读取的 HTML。
    """
    resolved_note = note or {
        "noteId": work_id,
        "title": "合成测试作品",
        "desc": "完全合成的测试文本",
        "type": "video",
        "time": 1_700_000_000_000,
        "lastUpdateTime": 1_700_000_100_000,
        "tagList": [{"name": "公版测试"}],
        "interactInfo": {
            "likedCount": "10",
            "collectedCount": "2",
            "commentCount": "1",
            "shareCount": "0",
        },
        "user": {
            "userId": "synthetic-author",
            "nickname": "合成作者",
            "avatar": "https://example.invalid/avatar.jpeg",
        },
        "imageList": [{}],
        "video": {"consumer": {"originVideoKey": "synthetic.mp4"}},
    }
    state = (
        {"noteData": {"data": {"noteData": resolved_note}}}
        if phone_layout
        else {"note": {"noteDetailMap": {work_id: {"note": resolved_note}}}}
    )
    script = f"window.__INITIAL_STATE__={json.dumps(state, ensure_ascii=False)}"
    return f"<html><script>{script}</script></html>"


def make_publication_draft(
    draft_id: str = "synthetic-draft",
    *,
    with_asset: bool = True,
) -> PublicationDraft:
    """构造不依赖真实平台的发布草稿。

    Args:
        draft_id: 草稿唯一标识。
        with_asset: 是否附带一个合成图片素材。

    Returns:
        字段完整的合成发布草稿。
    """
    now = datetime.now(UTC)
    assets = (
        [
            PublicationAsset(
                asset_id="synthetic-asset",
                filename="synthetic.jpg",
                media_type="image/jpeg",
                size=16,
                sha256="a" * 64,
                position=0,
            )
        ]
        if with_asset
        else []
    )
    return PublicationDraft(
        draft_id=draft_id,
        title="合成发布标题",
        body="合成发布正文",
        tags=["测试", "#合成", "测试"],
        assets=assets,
        created_at=now,
        updated_at=now,
    )
