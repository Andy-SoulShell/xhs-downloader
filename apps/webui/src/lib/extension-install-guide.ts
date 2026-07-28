import type { BrowserDriver } from "./types";

/** 扩展安装引导根据当前执行器和在线数量呈现的状态。 */
type ExtensionGuideMode = "hidden" | "install" | "connected";

/** 判断扩展安装引导应隐藏、展开还是收起为成功摘要。 */
export function extensionGuideMode(
  browserDriver: BrowserDriver | null,
  onlineCount: number,
): ExtensionGuideMode {
  if (browserDriver !== "extension") return "hidden";
  return onlineCount > 0 ? "connected" : "install";
}
