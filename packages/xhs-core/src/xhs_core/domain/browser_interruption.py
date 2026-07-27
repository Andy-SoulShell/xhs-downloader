"""浏览器任务中断原因的安全归因。"""

from .managed_browser import ManagedBrowserState

_STOPPED_READ = "受管浏览器已停止，这条读取任务没做完，可以直接重试"
_NOT_RUNNING_READ = (
    "受管浏览器已经不在运行，这条读取任务没做完。"
    "到「设置 → 连接方式」里启动它，再重试"
)
_TIMEOUT_READ = "受管浏览器一直没有响应，这条读取任务已中断，可以直接重试"
_DISCONNECTED_READ = "和受管浏览器的连接断开了，这条读取任务已中断，可以直接重试"
_UNKNOWN_READ = "受管浏览器执行这条读取任务时出错了，可以直接重试"
_STOPPED_WRITE = "受管浏览器已停止，这次操作有没有生效没能确认，请到小红书核对"
_UNKNOWN_WRITE = "这次操作有没有生效没能确认，请到小红书核对"


def interrupted_browser_task_message(
    *,
    may_write: bool,
    stopped: bool,
    browser_state: ManagedBrowserState | None,
    error: BaseException | None,
) -> str:
    """把一次执行中断归因成一句用户能照着做的话。

    异常原文可能夹带页面内容、URL 或用户文本，一律不进入返回值：这里只依据
    异常类型和受管浏览器当前状态归因，落到固定文案上。此前所有中断都写同一句
    「执行失败，可安全重试」，界面上一排失败记录长得一模一样，用户既不知道为
    什么失败，也不知道该去做什么。

    Args:
        may_write: 这条任务是否可能改变平台状态。
        stopped: 中断是否来自受管浏览器正常停止。
        browser_state: 中断时受管浏览器的运行状态；取不到时传 ``None``。
        error: 触发中断的异常；正常停止时为 ``None``。

    Returns:
        不含任何页面或用户数据的用户可读结论。
    """
    if may_write:
        # 写入路径的关键信息是"结果没确认、要人工核对",归因是次要的。
        return _STOPPED_WRITE if stopped else _UNKNOWN_WRITE
    if stopped:
        return _STOPPED_READ
    if browser_state is not None and browser_state is not ManagedBrowserState.RUNNING:
        return _NOT_RUNNING_READ
    if isinstance(error, TimeoutError):
        return _TIMEOUT_READ
    if isinstance(error, (ConnectionError, BrokenPipeError, EOFError)):
        return _DISCONNECTED_READ
    return _UNKNOWN_READ
