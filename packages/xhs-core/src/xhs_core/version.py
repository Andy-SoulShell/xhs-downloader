"""项目版本与浏览器扩展协作协议版本。"""

VERSION = "3.0.0"

# 本机服务当前实现的扩展协作协议版本。
# 必须与 packages/xhs-contracts/src/index.ts 的同名常量一致。
# 一致性由 tests/test_extension_protocol_version.py 校验。
EXTENSION_PROTOCOL_VERSION = 5

# 服务可以协作的最低扩展协议版本。
# 协议发生破坏性变更时提高该值。
# 旧扩展会在能力协商阶段明确失败。
# 而不是在任务执行中途因字段不匹配而失败。
MINIMUM_EXTENSION_PROTOCOL_VERSION = 4
