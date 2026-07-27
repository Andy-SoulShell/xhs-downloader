/** 当前构建使用的 API 路径；桌面包可显式设置为空以请求同源根路径。 */
export const API_BASE = (import.meta.env.VITE_API_BASE ?? "/api").replace(
  /\/$/,
  "",
);

import { UserFacingError } from "./error-message";

export async function parseResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as
    | { detail?: string; message?: string }
    | null;
  if (!response.ok) {
    throw new UserFacingError(
      payload?.message ||
        payload?.detail ||
        `请求失败（HTTP ${response.status}）`,
    );
  }
  return payload as T;
}
