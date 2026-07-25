import type { ManagedBrowserStatus } from "../lib/managed-browser-api";
import type { ManagedBrowserControl } from "../lib/use-managed-browser";

/** 创建不包含真实本机信息的合成受管浏览器状态。 */
export function makeManagedBrowserStatus(
  overrides: Partial<ManagedBrowserStatus> = {},
): ManagedBrowserStatus {
  return {
    installed: true,
    state: "stopped",
    executable_name: "synthetic-chromium",
    cdp_host: "127.0.0.1",
    cdp_port: null,
    profile_persistent: true,
    message: "合成受管浏览器状态",
    ...overrides,
  };
}

/** 创建组件测试使用的受管浏览器控制边界。 */
export function makeManagedBrowserControl(
  overrides: Partial<ManagedBrowserControl> = {},
): ManagedBrowserControl {
  return {
    error: "",
    loading: false,
    operation: null,
    refreshing: false,
    status: makeManagedBrowserStatus(),
    refresh: async () => undefined,
    start: async () => undefined,
    stop: async () => undefined,
    ...overrides,
  };
}
