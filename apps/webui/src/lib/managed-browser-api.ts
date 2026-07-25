import { API_BASE, parseResponse } from "./http";

/** 受管 Chromium 的生命周期状态。 */
export type ManagedBrowserState =
  | "stopped"
  | "starting"
  | "running"
  | "stopping"
  | "error";

/** 受管浏览器管理接口返回的脱敏状态。 */
export interface ManagedBrowserStatus {
  installed: boolean;
  state: ManagedBrowserState;
  executable_name: string | null;
  cdp_host: "127.0.0.1";
  cdp_port: number | null;
  profile_persistent: boolean;
  message: string;
}

/** 读取受管浏览器当前生命周期快照。 */
export async function getManagedBrowserStatus(
  signal?: AbortSignal,
): Promise<ManagedBrowserStatus> {
  const response = await fetch(`${API_BASE}/browser/managed/status`, {
    signal,
  });
  return parseResponse<ManagedBrowserStatus>(response);
}

/** 启动使用独立用户目录的受管浏览器。 */
export async function startManagedBrowser(): Promise<ManagedBrowserStatus> {
  const response = await fetch(`${API_BASE}/browser/managed/start`, {
    method: "POST",
  });
  return parseResponse<ManagedBrowserStatus>(response);
}

/** 停止受管浏览器并保留其登录资料。 */
export async function stopManagedBrowser(): Promise<ManagedBrowserStatus> {
  const response = await fetch(`${API_BASE}/browser/managed/stop`, {
    method: "POST",
  });
  return parseResponse<ManagedBrowserStatus>(response);
}
