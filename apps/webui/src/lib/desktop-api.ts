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

/** 请求桌面服务就地重启，使需要重启才能生效的配置进入运行状态。 */
export async function restartDesktopService(): Promise<string> {
  const response = await fetch(`${API_BASE}/desktop/restart`, {
    method: "POST",
  });
  const payload = await parseResponse<{ message: string }>(response);
  return payload.message;
}

/**
 * 等待服务重启完成。
 *
 * 重启期间连接会短暂中断，因此持续探测健康检查直到恢复；超时后由调用方
 * 提示用户手动刷新，而不是让界面停在“正在重启”。
 *
 * @param timeoutMs 最长等待毫秒数。
 * @param intervalMs 两次探测之间的间隔。
 * @returns 服务在超时前恢复时返回真。
 */
export async function waitForServiceReady(
  timeoutMs = 30_000,
  intervalMs = 500,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  // 先让出一个间隔，避免在服务尚未开始停止时就探测到旧进程。
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    try {
      const response = await fetch(`${API_BASE}/health`, { cache: "no-store" });
      if (response.ok) return true;
    } catch {
      // 重启期间连接被拒绝属于预期情况，继续等待。
    }
  }
  return false;
}
