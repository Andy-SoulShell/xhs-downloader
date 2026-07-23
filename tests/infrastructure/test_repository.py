"""SQLite 下载记录仓储测试。"""

from datetime import UTC, datetime
from pathlib import Path

from aiosqlite import connect

from src.domain import DownloadArtifact, DownloadRecord, MediaKind
from src.infrastructure.repository import SqliteDownloadRepository
from tests.helpers import make_detail


def _record(size: int = 4) -> DownloadRecord:
    detail = make_detail()
    return DownloadRecord(
        work_id=detail.work_id,
        source_fingerprint=detail.fingerprint(),
        artifacts=[
            DownloadArtifact(
                path="download/synthetic.mp4",
                sha256="0" * 64,
                size=size,
                media_index=1,
                kind=MediaKind.VIDEO,
            )
        ],
        updated_at=datetime(2024, 1, 1, tzinfo=UTC),
    )


async def test_missing_record_returns_none(tmp_path: Path) -> None:
    """确保首次读取会建库，并对不存在的作品返回空值。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    repository = SqliteDownloadRepository(tmp_path.joinpath("state/records.db"))

    assert await repository.get("missing") is None
    assert tmp_path.joinpath("state/records.db").is_file()


async def test_save_round_trip_and_overwrite(tmp_path: Path) -> None:
    """确保记录可完整读取，且同一作品的新记录会覆盖旧记录。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    repository = SqliteDownloadRepository(tmp_path.joinpath("records.db"))
    await repository.save(_record(size=4))
    await repository.save(_record(size=8))

    stored = await repository.get("synthetic-work")

    assert stored is not None
    assert stored.artifacts[0].size == 8


async def test_invalid_payload_is_ignored(tmp_path: Path) -> None:
    """确保损坏的历史记录不会阻断后续重新下载。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    database_path = tmp_path.joinpath("records.db")
    repository = SqliteDownloadRepository(database_path)
    await repository.get("initialize")
    async with connect(database_path) as database:
        await database.execute(
            """
            INSERT INTO download_record (work_id, payload, updated_at)
            VALUES (?, ?, ?)
            """,
            ("broken", '{"work_id": 1}', datetime.now(UTC).isoformat()),
        )
        await database.commit()

    assert await repository.get("broken") is None
