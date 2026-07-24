"""采集帖子 SQLite 仓储测试。"""

from xhs_adapters.sqlite import SqlitePostRepository

from tests.helpers import make_detail


async def test_post_repository_updates_and_deletes_details(tmp_path) -> None:
    """确保帖子详情可以幂等更新、跨实例读取和删除。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    database = tmp_path.joinpath("downloads.db")
    repository = SqlitePostRepository(database)
    detail = make_detail().model_copy(update={"title": "首次采集"})
    await repository.save(detail)
    await repository.save(detail.model_copy(update={"title": "再次采集"}))

    restored = await SqlitePostRepository(database).list_recent(10)
    assert len(restored) == 1
    assert restored[0].title == "再次采集"

    await repository.delete(detail.work_id)
    assert await repository.list_recent(10) == []
