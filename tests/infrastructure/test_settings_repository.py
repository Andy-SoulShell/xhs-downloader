"""dotenv 配置仓储测试。"""

import stat
from pathlib import Path

import pytest
from xhs_adapters.config import AppSettings, ImageFormat
from xhs_adapters.settings_repository import DotenvSettingsRepository
from xhs_core.domain import SettingsError


def test_dotenv_repository_preserves_context_and_writes_valid_values(
    tmp_path: Path,
) -> None:
    """确保配置更新保留注释和未知项，并可由 Pydantic 重新读取。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    env_file = tmp_path.joinpath(".env")
    env_file.write_text(
        ("# 自定义说明\nUNRELATED_VALUE=keep\nexport XHS_TIMEOUT=12\nXHS_TIMEOUT=18\n"),
        encoding="utf-8",
    )
    repository = DotenvSettingsRepository(env_file)

    repository.save(
        {
            "timeout": 30,
            "image_format": ImageFormat.PNG,
            "download_record": False,
            "mapping_data": {"synthetic": "合成作者"},
            "cookie": "session=synthetic",
        }
    )

    content = env_file.read_text(encoding="utf-8")
    settings = AppSettings.from_env(env_file)
    assert "# 自定义说明" in content
    assert "UNRELATED_VALUE=keep" in content
    assert "export XHS_TIMEOUT=30" in content
    assert content.count("XHS_TIMEOUT=") == 1
    assert settings.image_format is ImageFormat.PNG
    assert settings.download_record is False
    assert settings.mapping_data == {"synthetic": "合成作者"}
    assert settings.cookie.get_secret_value() == "session=synthetic"
    assert stat.S_IMODE(env_file.stat().st_mode) == 0o600


def test_dotenv_repository_creates_missing_file(tmp_path: Path) -> None:
    """确保首次保存可以创建安全配置文件。

    Args:
        tmp_path: Pytest 提供的临时目录。
    """
    env_file = tmp_path.joinpath("config", ".env")

    DotenvSettingsRepository(env_file).save({"proxy": None})

    assert env_file.read_text(encoding="utf-8") == 'XHS_PROXY=""\n'


def test_dotenv_repository_removes_temporary_file_after_failure(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """确保原子替换失败后不会遗留包含敏感值的临时文件。

    Args:
        tmp_path: Pytest 提供的临时目录。
        monkeypatch: Pytest 提供的属性替换工具。
    """
    env_file = tmp_path.joinpath(".env")

    def fail_replace(_: Path, __: Path) -> None:
        raise OSError("synthetic failure")

    monkeypatch.setattr(
        "xhs_adapters.settings_repository.os.replace",
        fail_replace,
    )

    with pytest.raises(SettingsError, match="配置文件写入失败"):
        DotenvSettingsRepository(env_file).save({"cookie": "session=synthetic"})

    assert list(tmp_path.iterdir()) == []
