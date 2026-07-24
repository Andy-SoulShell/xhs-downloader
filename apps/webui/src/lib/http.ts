export const API_BASE = (import.meta.env.VITE_API_BASE || "/api").replace(
  /\/$/,
  "",
);

export async function parseResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as
    | { detail?: string; message?: string }
    | null;
  if (!response.ok) {
    throw new Error(
      payload?.message ||
        payload?.detail ||
        `请求失败（HTTP ${response.status}）`,
    );
  }
  return payload as T;
}
