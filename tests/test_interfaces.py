"""API 与 MCP 接口测试。"""

from datetime import UTC, datetime

from fastmcp import Client
from httpx import ASGITransport, AsyncClient
from typer.testing import CliRunner

from src.config import AppSettings
from src.domain import Author, DownloadOutcome, WorkDetail, WorkType
from src.interfaces import create_api, create_mcp
from src.interfaces.cli import app


async def test_api_returns_chinese_structured_data() -> None:
    """确保 API 返回中文结构化数据。"""
    api = create_api(AppSettings(), lambda _: _Service())
    async with api.router.lifespan_context(api):
        transport = ASGITransport(app=api)
        async with AsyncClient(
            transport=transport,
            base_url="http://test",
        ) as client:
            response = await client.post(
                "/xhs/detail",
                json={"url": "https://example.invalid/work"},
            )

    assert response.status_code == 200
    assert response.json()["data"]["作品标题"] == "合成测试作品"


async def test_mcp_registers_and_calls_tools() -> None:
    """确保 MCP 工具注册和调用链均可用。"""
    mcp = create_mcp(_Service())
    async with Client(mcp) as client:
        tools = await client.list_tools()
        result = await client.call_tool(
            "download_detail",
            {
                "url": "https://example.invalid/work",
                "index": None,
                "force": False,
                "return_data": True,
            },
        )

    assert [tool.name for tool in tools] == ["get_detail_data", "download_detail"]
    assert not result.is_error
    assert result.data["data"]["作品ID"] == "synthetic-work"


def test_cli_help_uses_chinese_fixed_text() -> None:
    """确保 CLI 帮助中的结构标签与帮助选项均使用中文。"""
    result = CliRunner().invoke(app, ["--help"])

    assert result.exit_code == 0
    assert "用法:" in result.output
    assert "选项" in result.output
    assert "命令" in result.output
    assert "显示帮助并退出。" in result.output


class _Service:
    async def __aenter__(self) -> "_Service":
        return self

    async def __aexit__(self, exc_type, exc_value, traceback) -> None:
        return None

    async def get_detail(
        self,
        text: str,
        cookie: str | None = None,
    ) -> WorkDetail:
        return _detail()

    async def download(
        self,
        text: str,
        indexes: set[int] | None = None,
        force: bool = False,
        cookie: str | None = None,
    ) -> DownloadOutcome:
        return DownloadOutcome(message="作品文件下载完成", detail=_detail())


def _detail() -> WorkDetail:
    return WorkDetail(
        work_id="synthetic-work",
        source_url="https://example.invalid/work",
        title="合成测试作品",
        description="完全合成的测试文本",
        work_type=WorkType.UNKNOWN,
        published_at=datetime(2024, 1, 1, tzinfo=UTC),
        author=Author(
            author_id="synthetic-author",
            nickname="合成作者",
            profile_url="https://example.invalid/author",
        ),
    )
