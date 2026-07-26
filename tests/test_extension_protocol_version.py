"""扩展协作协议版本的跨语言一致性测试。"""

import re
from pathlib import Path

from xhs_core.version import (
    EXTENSION_PROTOCOL_VERSION,
    MINIMUM_EXTENSION_PROTOCOL_VERSION,
)

_CONTRACTS = (
    Path(__file__).resolve().parents[1].joinpath("packages/xhs-contracts/src/index.ts")
)
_PATTERN = re.compile(r"EXTENSION_PROTOCOL_VERSION\s*=\s*(\d+)")


def test_contracts_declare_the_same_protocol_version() -> None:
    """确保 TypeScript 契约与服务端声明同一个协议版本。

    两侧常量分属不同语言，无法互相引用；协议升级时如果只改一侧，
    版本协商会静默失效，因此在此显式比对。
    """
    match = _PATTERN.search(_CONTRACTS.read_text(encoding="utf-8"))

    assert match is not None, "契约文件缺少 EXTENSION_PROTOCOL_VERSION"
    assert int(match.group(1)) == EXTENSION_PROTOCOL_VERSION


def test_minimum_protocol_does_not_exceed_current_version() -> None:
    """确保服务要求的最低扩展协议不高于自身实现的版本。

    最低要求高于当前版本会让同一版本一起分发的扩展直接被拒绝。
    """
    assert MINIMUM_EXTENSION_PROTOCOL_VERSION <= EXTENSION_PROTOCOL_VERSION
