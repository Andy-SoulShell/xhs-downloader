"""dotenv 配置文件持久化。"""

import json
import os
import re
from collections.abc import Mapping
from contextlib import suppress
from enum import Enum
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Any

from xhs_core.domain import SettingsError

_ENV_LINE = re.compile(
    r"^(?P<prefix>\s*(?:export\s+)?)(?P<key>[A-Za-z_][A-Za-z0-9_]*)\s*=.*$"
)


class DotenvSettingsRepository:
    """以原子替换方式更新 dotenv，并保留注释和未知配置。

    Attributes:
        path: 需要维护的 dotenv 文件路径。
    """

    def __init__(self, path: Path) -> None:
        """初始化仓储。

        Args:
            path: dotenv 文件路径。
        """
        self.path = path.expanduser().resolve()

    def save(self, values: Mapping[str, Any]) -> None:
        """写入一组应用字段。

        已存在的键原位替换，缺失的键追加到文件末尾。临时文件与目标文件位于
        同一目录，写入完成后使用原子替换，并把权限收紧为仅当前用户可读写。

        Args:
            values: AppSettings 字段名及其新值。

        Raises:
            SettingsError: 创建目录或写入配置失败。
        """
        temporary_path: Path | None = None
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            current = (
                self.path.read_text(encoding="utf-8").splitlines()
                if self.path.exists()
                else []
            )
            updated = self._replace_lines(current, values)
            content = "\n".join(updated).rstrip() + "\n"
            with NamedTemporaryFile(
                "w",
                dir=self.path.parent,
                encoding="utf-8",
                delete=False,
            ) as temporary:
                temporary_path = Path(temporary.name)
                temporary.write(content)
                temporary.flush()
                os.fsync(temporary.fileno())
            os.chmod(temporary_path, 0o600)
            os.replace(temporary_path, self.path)
        except OSError as error:
            if temporary_path is not None:
                with suppress(OSError):
                    temporary_path.unlink(missing_ok=True)
            raise SettingsError(f"配置文件写入失败：{error}") from error

    @staticmethod
    def _replace_lines(
        lines: list[str],
        values: Mapping[str, Any],
    ) -> list[str]:
        encoded = {
            f"XHS_{field.upper()}": _encode_env_value(value)
            for field, value in values.items()
        }
        written: set[str] = set()
        result: list[str] = []
        for line in lines:
            match = _ENV_LINE.match(line)
            if not match or match.group("key") not in encoded:
                result.append(line)
                continue
            key = match.group("key")
            if key in written:
                continue
            result.append(f"{match.group('prefix')}{key}={encoded[key]}")
            written.add(key)
        missing = ((key, value) for key, value in encoded.items() if key not in written)
        additions = list(missing)
        if additions:
            if result and result[-1].strip():
                result.append("")
            result.extend(f"{key}={value}" for key, value in additions)
        return result


def _encode_env_value(value: Any) -> str:
    if isinstance(value, Enum):
        value = value.value
    if isinstance(value, Path):
        value = str(value)
    if isinstance(value, bool):
        return str(value).lower()
    if isinstance(value, Mapping):
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    if value is None:
        return '""'
    if isinstance(value, (int, float)):
        return str(value)
    return json.dumps(str(value), ensure_ascii=False)
