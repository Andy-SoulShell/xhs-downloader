import type {
  ClientDownloadRecord,
  DetailRequest,
  DetailResponse,
  DownloadTask,
  DownloadTaskStatus,
  TaskRequest,
} from "./types";

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

export async function submitTask(request: TaskRequest): Promise<DownloadTask> {
  const response = await fetch(`${API_BASE}/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  return parseResponse<DownloadTask>(response);
}

export async function listTasks(
  status?: DownloadTaskStatus,
): Promise<DownloadTask[]> {
  const query = status ? `?status=${status}` : "";
  const response = await fetch(`${API_BASE}/tasks${query}`);
  return parseResponse<DownloadTask[]>(response);
}

export async function retryTask(taskId: string): Promise<DownloadTask> {
  const response = await fetch(`${API_BASE}/tasks/${taskId}/retry`, {
    method: "POST",
  });
  return parseResponse<DownloadTask>(response);
}

export async function listClientRecords(): Promise<ClientDownloadRecord[]> {
  const response = await fetch(`${API_BASE}/extension/records`);
  return parseResponse<ClientDownloadRecord[]>(response);
}
