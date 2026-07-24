import type {
  ClientDownloadRecord,
  DetailRequest,
  DetailResponse,
  DownloadTask,
  DownloadTaskStatus,
  SettingsResponse,
  SettingsUpdate,
  TaskRequest,
  WorkDetail,
} from "./types";

import { API_BASE, parseResponse } from "./http";

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

export async function listCollectedPosts(): Promise<WorkDetail[]> {
  const response = await fetch(`${API_BASE}/posts`);
  return parseResponse<WorkDetail[]>(response);
}

export async function deleteCollectedPost(workId: string): Promise<void> {
  const response = await fetch(
    `${API_BASE}/posts/${encodeURIComponent(workId)}`,
    { method: "DELETE" },
  );
  await parseResponse<void>(response);
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

export async function getSettings(): Promise<SettingsResponse> {
  const response = await fetch(`${API_BASE}/settings`);
  return parseResponse<SettingsResponse>(response);
}

export async function updateSettings(
  values: SettingsUpdate,
): Promise<SettingsResponse> {
  const response = await fetch(`${API_BASE}/settings`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(values),
  });
  return parseResponse<SettingsResponse>(response);
}
