"""管理端草稿素材读取与内容漂移信号的合成流程测试。"""

from httpx import ASGITransport, AsyncClient
from xhs_adapters.config import AppSettings
from xhs_api.app import create_api

from tests.interfaces.helpers import FakeService

_MEDIA = b"synthetic-media-bytes"


async def test_management_can_read_draft_asset_for_thumbnails(tmp_path) -> None:
    """确保本机管理端能按草稿直接取回素材原文件。

    Args:
        tmp_path: pytest 提供的临时目录。
    """
    api = create_api(AppSettings(work_path=tmp_path), lambda _: FakeService())
    async with (
        api.router.lifespan_context(api),
        AsyncClient(
            transport=ASGITransport(app=api),
            base_url="http://127.0.0.1:5556",
        ) as client,
    ):
        created = await client.post("/publication/drafts", json={"title": "封面"})
        draft_id = created.json()["draft_id"]
        uploaded = await client.post(
            f"/publication/drafts/{draft_id}/assets",
            files={"upload": ("synthetic.jpg", _MEDIA, "image/jpeg")},
        )
        asset_id = uploaded.json()["assets"][0]["asset_id"]
        fetched = await client.get(f"/publication/drafts/{draft_id}/assets/{asset_id}")
        missing = await client.get(
            f"/publication/drafts/{draft_id}/assets/not-an-asset"
        )

    assert fetched.status_code == 200
    assert fetched.content == _MEDIA
    assert missing.status_code == 400


async def test_draft_asset_read_rejects_remote_client(tmp_path) -> None:
    """确保草稿素材只对本机管理端开放。

    Args:
        tmp_path: pytest 提供的临时目录。
    """
    api = create_api(AppSettings(work_path=tmp_path), lambda _: FakeService())
    async with (
        api.router.lifespan_context(api),
        AsyncClient(
            transport=ASGITransport(app=api),
            base_url="http://127.0.0.1:5556",
        ) as local,
        AsyncClient(
            transport=ASGITransport(app=api, client=("203.0.113.9", 40002)),
            base_url="http://127.0.0.1:5556",
        ) as remote,
    ):
        created = await local.post("/publication/drafts", json={"title": "封面"})
        draft_id = created.json()["draft_id"]
        uploaded = await local.post(
            f"/publication/drafts/{draft_id}/assets",
            files={"upload": ("synthetic.jpg", _MEDIA, "image/jpeg")},
        )
        asset_id = uploaded.json()["assets"][0]["asset_id"]
        response = await remote.get(f"/publication/drafts/{draft_id}/assets/{asset_id}")

    assert response.status_code == 403


async def test_draft_carries_content_fingerprint_matching_frozen_task(
    tmp_path,
) -> None:
    """确保草稿下发的内容指纹能识别提交后又改稿的情况。

    Args:
        tmp_path: pytest 提供的临时目录。
    """
    api = create_api(AppSettings(work_path=tmp_path), lambda _: FakeService())
    async with (
        api.router.lifespan_context(api),
        AsyncClient(
            transport=ASGITransport(app=api),
            base_url="http://127.0.0.1:5556",
        ) as client,
    ):
        created = await client.post("/publication/drafts", json={"title": "初稿"})
        draft_id = created.json()["draft_id"]
        await client.post(
            f"/publication/drafts/{draft_id}/assets",
            files={"upload": ("synthetic.jpg", _MEDIA, "image/jpeg")},
        )
        submitted = await client.post(
            f"/publication/drafts/{draft_id}/submit",
            json={"mode": "manual"},
        )
        frozen = submitted.json()["package_fingerprint"]
        before = await client.get(f"/publication/drafts/{draft_id}")
        edited = await client.put(
            f"/publication/drafts/{draft_id}",
            json={"title": "改过的稿子", "body": "", "tags": []},
        )

    assert before.json()["content_fingerprint"] == frozen
    assert edited.json()["content_fingerprint"] != frozen
