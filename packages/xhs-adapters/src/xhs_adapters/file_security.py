"""跨平台本地敏感文件权限收紧。"""

import os
import sys
from pathlib import Path


def restrict_file_to_current_user(path: Path) -> None:
    """把本地敏感文件限制为仅当前用户可访问。

    POSIX 使用 ``0600`` 模式；Windows 使用受保护 DACL，移除继承项并只
    授予当前进程用户完全控制权限。

    Args:
        path: 已存在的本地文件。

    Raises:
        OSError: 权限调整失败。
    """
    if sys.platform == "win32":
        _restrict_windows_path(path, inherit_children=False)
        return
    os.chmod(path, 0o600)


def restrict_directory_to_current_user(path: Path) -> None:
    """把本地敏感目录限制为仅当前用户可访问。

    POSIX 使用 ``0700`` 模式；Windows 使用可向子项继承的受保护 DACL。

    Args:
        path: 已存在的本地目录。

    Raises:
        OSError: 权限调整失败。
    """
    if sys.platform == "win32":
        _restrict_windows_path(path, inherit_children=True)
        return
    os.chmod(path, 0o700)


def _restrict_windows_path(path: Path, *, inherit_children: bool) -> None:
    import ntsecuritycon
    import pywintypes
    import win32api
    import win32security

    token = None
    try:
        token = win32security.OpenProcessToken(
            win32api.GetCurrentProcess(),
            ntsecuritycon.TOKEN_QUERY,
        )
        user_sid = win32security.GetTokenInformation(
            token,
            win32security.TokenUser,
        )[0]
        dacl = win32security.ACL()
        inheritance = 0
        if inherit_children:
            inheritance = (
                ntsecuritycon.OBJECT_INHERIT_ACE | ntsecuritycon.CONTAINER_INHERIT_ACE
            )
        dacl.AddAccessAllowedAceEx(
            win32security.ACL_REVISION,
            inheritance,
            ntsecuritycon.FILE_ALL_ACCESS,
            user_sid,
        )
        win32security.SetNamedSecurityInfo(
            str(path),
            win32security.SE_FILE_OBJECT,
            (
                win32security.DACL_SECURITY_INFORMATION
                | win32security.PROTECTED_DACL_SECURITY_INFORMATION
            ),
            None,
            None,
            dacl,
            None,
        )
    except pywintypes.error as error:
        code = int(error.winerror or 1)
        raise OSError(code, str(error), str(path)) from error
    finally:
        if token is not None:
            token.Close()
