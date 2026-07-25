"""从推荐页初始状态严格识别当前登录账号。"""

from ._feed_data import record, text, unwrap
from ._initial_state import load_latest_initial_state


def parse_current_account_id(html: str) -> str | None:
    """读取推荐页明确标记为已登录的当前账号 ID。

    Args:
        html: 小红书推荐页 HTML。

    Returns:
        同时具备 ``guest=False`` 和合法用户 ID 时返回 ID，否则返回
        ``None``。
    """
    state = load_latest_initial_state(html)
    if state is None:
        return None
    user = record(state.get("user"))
    info = record(unwrap(user.get("userInfo")))
    user_id = text(info.get("userId", info.get("user_id")))
    if info.get("guest") is not False or not 1 <= len(user_id) <= 128:
        return None
    return user_id
