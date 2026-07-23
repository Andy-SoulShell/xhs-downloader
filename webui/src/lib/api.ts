import type { DetailRequest, DetailResponse } from "./types";

const API_BASE = (import.meta.env.VITE_API_BASE || "/api").replace(/\/$/, "");

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as
    | { message?: string }
    | null;
  if (!response.ok) {
    throw new Error(payload?.message || `请求失败（HTTP ${response.status}）`);
  }
  return payload as T;
}

export async function checkHealth(signal?: AbortSignal): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/health`, { signal });
    if (!response.ok) return false;
    const payload = (await response.json()) as { status?: string };
    return payload.status === "ok";
  } catch {
    return false;
  }
}

export async function submitDetail(
  request: DetailRequest,
): Promise<DetailResponse> {
  const response = await fetch(`${API_BASE}/xhs/detail`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  return parseResponse<DetailResponse>(response);
}
