"""扩展安装实例的身份组合与拆分。"""

_SEPARATOR = "\x1f"
"""单元分隔符。扩展 ID 与安装标识都取自受限字符集, 不可能包含控制字符。"""


def build_extension_identity(
    extension_id: str,
    installation_id: str | None = None,
) -> str:
    """把扩展标识与安装标识合成一个凭据身份。

    未打包扩展的 ID 由目录绝对路径推导, 同一个目录在不同浏览器中加载会得到
    完全相同的 ID。仅按扩展 ID 存凭据会让两个浏览器里的实例互相顶掉对方的
    令牌, 谁都拿不稳, 因此身份必须细到安装实例。

    Args:
        extension_id: 浏览器分配的扩展 ID。
        installation_id: 扩展首次运行时生成并持久化的安装标识；
            旧版本不携带该字段时为空, 沿用按扩展 ID 的单槽行为。

    Returns:
        可直接用作凭据键与任务领取者的身份字符串。
    """
    if not installation_id:
        return extension_id
    return f"{extension_id}{_SEPARATOR}{installation_id}"


def split_extension_identity(identity: str) -> tuple[str, str | None]:
    """把凭据身份还原为扩展标识与安装标识。

    Args:
        identity: `build_extension_identity` 生成的身份字符串。

    Returns:
        扩展 ID 与安装标识；旧版本身份的安装标识为空。
    """
    extension_id, separator, installation_id = identity.partition(_SEPARATOR)
    return extension_id, installation_id if separator else None
