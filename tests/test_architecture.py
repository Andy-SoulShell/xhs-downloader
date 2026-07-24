"""项目结构与公开文档约束测试。"""

import ast
from pathlib import Path

ROOT = Path(__file__).parents[1]
PYTHON_SOURCE_ROOTS = [
    ROOT.joinpath("apps", name, "src") for name in ("api", "cli", "mcp")
] + [
    ROOT.joinpath("packages", name, "src")
    for name in ("xhs-adapters", "xhs-core", "xhs-sdk")
]
PYTHON_FILES = [
    ROOT.joinpath("main.py"),
    ROOT.joinpath("example.py"),
    *(file for source in PYTHON_SOURCE_ROOTS for file in source.rglob("*.py")),
    *ROOT.joinpath("tests").rglob("*.py"),
]
FRONTEND_FILES = [
    *ROOT.joinpath("apps", "webui", "src").rglob("*.ts"),
    *ROOT.joinpath("apps", "webui", "src").rglob("*.tsx"),
    *ROOT.joinpath("apps", "webui", "src").rglob("*.css"),
    *ROOT.joinpath("apps", "extension", "src").rglob("*.ts"),
    *ROOT.joinpath("apps", "extension", "src").rglob("*.css"),
    *ROOT.joinpath("packages", "xhs-contracts", "src").rglob("*.ts"),
]


def test_python_files_are_small() -> None:
    """确保每个 Python 文件不超过三百行。"""
    oversized = {
        file.relative_to(ROOT): len(file.read_text(encoding="utf-8").splitlines())
        for file in PYTHON_FILES
        if len(file.read_text(encoding="utf-8").splitlines()) > 300
    }
    assert not oversized, oversized


def test_frontend_files_are_small() -> None:
    """确保 WebUI 与扩展源文件均不超过三百行。"""
    oversized = {
        file.relative_to(ROOT): len(file.read_text(encoding="utf-8").splitlines())
        for file in FRONTEND_FILES
        if len(file.read_text(encoding="utf-8").splitlines()) > 300
    }
    assert not oversized, oversized


def test_modules_and_public_interfaces_have_docstrings() -> None:
    """确保模块与公开接口均有清晰 docstring。"""
    missing: list[str] = []
    for file in PYTHON_FILES:
        tree = ast.parse(file.read_text(encoding="utf-8"))
        relative = file.relative_to(ROOT)
        if not ast.get_docstring(tree):
            missing.append(f"{relative}:模块")
        for node in tree.body:
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                _check_function(node, str(relative), missing)
            elif isinstance(node, ast.ClassDef) and _is_public(node.name):
                if not ast.get_docstring(node):
                    missing.append(f"{relative}:{node.name}")
                for child in node.body:
                    if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef)):
                        _check_function(child, f"{relative}:{node.name}", missing)
    assert not missing, missing


def test_public_docstrings_use_google_sections() -> None:
    """确保公开函数按签名提供 Google 风格参数和返回值说明。"""
    violations: list[str] = []
    for file in PYTHON_FILES:
        tree = ast.parse(file.read_text(encoding="utf-8"))
        relative = file.relative_to(ROOT)
        for owner, node in _public_functions(tree):
            docstring = ast.get_docstring(node) or ""
            arguments = _documented_arguments(node)
            location = f"{relative}:{owner}{node.name}"
            if arguments and "Args:" not in docstring:
                violations.append(f"{location} 缺少 Args")
            has_result_section = "Returns:" in docstring or "Yields:" in docstring
            if _returns_value(node) and not has_result_section:
                violations.append(f"{location} 缺少 Returns")
    assert not violations, violations


def test_workspace_dependency_direction() -> None:
    """确保共享包和独立应用只沿约定方向依赖。"""
    boundaries = {
        ROOT.joinpath("packages", "xhs-core", "src"): {
            "xhs_adapters",
            "xhs_api",
            "xhs_cli",
            "xhs_mcp",
            "xhs_sdk",
        },
        ROOT.joinpath("packages", "xhs-adapters", "src"): {
            "xhs_api",
            "xhs_cli",
            "xhs_mcp",
            "xhs_sdk",
        },
        ROOT.joinpath("apps", "api", "src"): {"xhs_cli", "xhs_mcp"},
        ROOT.joinpath("apps", "cli", "src"): {"xhs_api", "xhs_mcp"},
        ROOT.joinpath("apps", "mcp", "src"): {"xhs_api", "xhs_cli"},
    }
    violations: list[str] = []
    for source_root, forbidden in boundaries.items():
        for file in source_root.rglob("*.py"):
            imports = _top_level_imports(ast.parse(file.read_text(encoding="utf-8")))
            invalid = imports & forbidden
            if invalid:
                relative = file.relative_to(ROOT)
                violations.append(f"{relative}: {sorted(invalid)}")
    assert not violations, violations


def _public_functions(
    tree: ast.Module,
) -> list[tuple[str, ast.FunctionDef | ast.AsyncFunctionDef]]:
    result = []
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and _is_public(
            node.name
        ):
            result.append(("", node))
        elif isinstance(node, ast.ClassDef) and _is_public(node.name):
            result.extend(
                (f"{node.name}.", child)
                for child in node.body
                if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef))
                and _is_public(child.name)
            )
    return result


def _check_function(
    node: ast.FunctionDef | ast.AsyncFunctionDef,
    owner: str,
    missing: list[str],
) -> None:
    if _is_public(node.name) and not ast.get_docstring(node):
        missing.append(f"{owner}:{node.name}")


def _top_level_imports(tree: ast.Module) -> set[str]:
    """提取模块使用的顶层包名。

    Args:
        tree: 已解析的 Python 语法树。

    Returns:
        模块直接或间接导入的顶层包名集合。
    """
    result: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            result.update(alias.name.partition(".")[0] for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            result.add(node.module.partition(".")[0])
    return result


def _documented_arguments(
    node: ast.FunctionDef | ast.AsyncFunctionDef,
) -> list[ast.arg]:
    arguments = [
        *node.args.posonlyargs,
        *node.args.args,
        *node.args.kwonlyargs,
    ]
    return [item for item in arguments if item.arg not in {"self", "cls"}]


def _returns_value(node: ast.FunctionDef | ast.AsyncFunctionDef) -> bool:
    annotation = node.returns
    if annotation is None:
        return False
    if isinstance(annotation, ast.Constant) and annotation.value is None:
        return False
    return not (isinstance(annotation, ast.Name) and annotation.id == "None")


def _is_public(name: str) -> bool:
    return not name.startswith("_")
