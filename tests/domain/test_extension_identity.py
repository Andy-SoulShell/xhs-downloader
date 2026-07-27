"""扩展安装实例身份组合的测试。"""

from xhs_core.domain import build_extension_identity, split_extension_identity


def test_two_installations_of_one_extension_get_distinct_identities() -> None:
    """同一目录在两个浏览器里扩展 ID 相同, 身份必须靠安装标识区分。"""
    chrome = build_extension_identity("abc", "installation-chrome")
    edge = build_extension_identity("abc", "installation-edge")

    # 不区分就会共用一条凭据, 两边互相顶掉令牌并陷入登记循环
    assert chrome != edge
    assert split_extension_identity(chrome) == ("abc", "installation-chrome")
    assert split_extension_identity(edge) == ("abc", "installation-edge")


def test_missing_installation_falls_back_to_extension_id() -> None:
    """旧版本不携带安装标识, 沿用按扩展 ID 的单槽行为。"""
    assert build_extension_identity("abc") == "abc"
    assert build_extension_identity("abc", None) == "abc"
    assert build_extension_identity("abc", "") == "abc"
    assert split_extension_identity("abc") == ("abc", None)


def test_identity_round_trips_unusual_but_legal_values() -> None:
    """标识可能包含连字符与大小写, 拆分不得损坏。"""
    identity = build_extension_identity("A-b_C", "9f2e-4c1a")

    assert split_extension_identity(identity) == ("A-b_C", "9f2e-4c1a")
