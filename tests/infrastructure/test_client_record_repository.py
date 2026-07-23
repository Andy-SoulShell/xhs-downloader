"""浏览器扩展下载记录仓储测试。"""

from datetime import UTC, datetime, timedelta

from aiosqlite import connect

from src.domain import (
    ClientDownloadRecord,
    ClientRecordStatus,
    DownloadMode,
)
from src.infrastructure import SqliteClientRecordRepository


def make_record(
    record_id: str,
    created_at: datetime,
) -> ClientDownloadRecord:
    """创建不含真实平台内容的合成客户端记录。

    Args:
        record_id: 记录唯一标识。
        created_at: 客户端创建时间。

    Returns:
        可持久化的合成记录。
    """
    return ClientDownloadRecord(
        record_id=record_id,
        work_id="synthetic-work",
        source_url="https://example.invalid/synthetic-work",
        title="合成测试作品",
        mode=DownloadMode.BROWSER,
        status=ClientRecordStatus.COMPLETED,
        media_indexes=[1, 2],
        created_at=created_at,
        message="合成下载完成",
    )


async def test_client_records_are_idempotent_and_ordered(tmp_path) -> None:
    """确保重复同步可覆盖且列表保持倒序。

    Args:
        tmp_path: pytest 提供的临时目录。
    """
    repository = SqliteClientRecordRepository(tmp_path.joinpath("records.db"))
    now = datetime.now(UTC)
    older = make_record("older", now - timedelta(minutes=1))
    newer = make_record("newer", now)

    assert await repository.save_many([]) == 0
    assert await repository.save_many([older, newer]) == 2
    changed = older.model_copy(update={"message": "已更新"})
    assert await repository.save_many([changed]) == 1

    records = await repository.list_recent(10)

    assert [record.record_id for record in records] == ["newer", "older"]
    assert records[1].message == "已更新"


async def test_client_records_ignore_invalid_payload(tmp_path) -> None:
    """确保损坏的历史记录不会阻断有效记录读取。

    Args:
        tmp_path: pytest 提供的临时目录。
    """
    database = tmp_path.joinpath("records.db")
    repository = SqliteClientRecordRepository(database)
    valid = make_record("valid", datetime.now(UTC))
    await repository.save_many([valid])
    async with connect(database) as connection:
        await connection.execute(
            """
            INSERT INTO client_download_record (record_id, payload, created_at)
            VALUES (?, ?, ?)
            """,
            ("invalid", "{}", "9999-01-01T00:00:00+00:00"),
        )
        await connection.commit()

    records = await repository.list_recent(10)

    assert [record.record_id for record in records] == ["valid"]
