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
import { isBrowserDriver } from "./types";

import { API_BASE, parseResponse } from "./http";
import { UserFacingError } from "./error-message";

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

export async function submitDetail(request: DetailRequest): Promise<DetailResponse> {
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
  const response = await fetch(`${API_BASE}/posts/${encodeURIComponent(workId)}`, {
    method: "DELETE",
  });
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

export async function listTasks(status?: DownloadTaskStatus): Promise<DownloadTask[]> {
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

/** 读取并验证本地服务的可管理配置。 */
export async function getSettings(): Promise<SettingsResponse> {
  const response = await fetch(`${API_BASE}/settings`);
  return requireSettingsResponse(await parseResponse<unknown>(response));
}

/** 保存配置，并验证原子切换后返回的新配置快照。 */
export async function updateSettings(values: SettingsUpdate): Promise<SettingsResponse> {
  const response = await fetch(`${API_BASE}/settings`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(values),
  });
  return requireSettingsResponse(await parseResponse<unknown>(response));
}

function requireSettingsResponse(value: unknown): SettingsResponse {
  if (!value || typeof value !== "object" || !("values" in value)) {
    throw new UserFacingError("本地服务返回的配置结构无效");
  }
  const values = value.values;
  if (
    !values ||
    typeof values !== "object" ||
    !("browser_driver" in values) ||
    !isBrowserDriver(values.browser_driver)
  ) {
    throw new UserFacingError("本地服务返回了不支持的连接方式");
  }
  return value as SettingsResponse;
}
