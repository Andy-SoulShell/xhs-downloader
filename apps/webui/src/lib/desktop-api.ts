import { API_BASE, parseResponse } from "./http";

/** 桌面实例身份，仅用于区分一体化安装包与开发 API。 */
export interface DesktopIdentity {
  instance_id: string;
}

/** 检测当前同源服务是否由桌面启动器提供。 */
export async function detectDesktopService(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/desktop/identity`);
    if (!response.ok) return false;
    const payload = (await response.json()) as Partial<DesktopIdentity>;
    return typeof payload.instance_id === "string" && !!payload.instance_id;
  } catch {
    return false;
  }
}

/** 请求桌面服务完成当前清理后优雅退出。 */
export async function shutdownDesktopService(): Promise<string> {
  const response = await fetch(`${API_BASE}/desktop/shutdown`, {
    method: "POST",
  });
  const payload = await parseResponse<{ message: string }>(response);
  return payload.message;
}
