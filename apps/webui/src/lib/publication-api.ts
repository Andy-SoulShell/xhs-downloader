import { API_BASE, parseResponse } from "./http";
import type {
  PublicationDraft,
  PublicationDraftInput,
  PublicationMode,
  PublicationTask,
  PublicationVerificationResumeResult,
} from "./publication";
import { isBrowserDriver } from "./types";
import { UserFacingError } from "./error-message";

/**
 * 一次能取回的草稿上限。
 *
 * 服务端默认只给 100 份、最多给 500 份，超出的部分不会有任何提示地消失。
 * 显式要 200 份，界面才知道自己拿到的是不是全部（返回条数等于上限即为截断）。
 */
export const DRAFT_PAGE_LIMIT = 200;

export async function listPublicationDrafts(limit = DRAFT_PAGE_LIMIT): Promise<PublicationDraft[]> {
  const response = await fetch(`${API_BASE}/publication/drafts?limit=${limit}`);
  return parseResponse<PublicationDraft[]>(response);
}

/** 本机管理端读取草稿素材原文件的地址，用于封面和缩略图。 */
export function publicationAssetUrl(draftId: string, assetId: string): string {
  return `${API_BASE}/publication/drafts/${draftId}/assets/${assetId}`;
}

export async function createPublicationDraft(): Promise<PublicationDraft> {
  const response = await fetch(`${API_BASE}/publication/drafts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  return parseResponse<PublicationDraft>(response);
}

/**
 * 覆盖保存一份草稿。
 *
 * @param draftId 草稿标识。
 * @param input 完整的草稿内容。
 * @param options.keepalive 关闭页面时的补写请用 true，让请求在文档销毁后
 *   仍能发完；草稿保存是 PUT，用不了只支持 POST 的 sendBeacon。
 * @returns 保存后的草稿。
 */
export async function updatePublicationDraft(
  draftId: string,
  input: PublicationDraftInput,
  options?: { keepalive?: boolean },
): Promise<PublicationDraft> {
  const response = await fetch(`${API_BASE}/publication/drafts/${draftId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    keepalive: options?.keepalive,
  });
  return parseResponse<PublicationDraft>(response);
}

export async function deletePublicationDraft(draftId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/publication/drafts/${draftId}`, {
    method: "DELETE",
  });
  if (!response.ok) await parseResponse(response);
}

export async function uploadPublicationAsset(
  draftId: string,
  file: File,
): Promise<PublicationDraft> {
  const data = new FormData();
  data.append("upload", file);
  const response = await fetch(`${API_BASE}/publication/drafts/${draftId}/assets`, {
    method: "POST",
    body: data,
  });
  return parseResponse<PublicationDraft>(response);
}

export async function removePublicationAsset(
  draftId: string,
  assetId: string,
): Promise<PublicationDraft> {
  const response = await fetch(`${API_BASE}/publication/drafts/${draftId}/assets/${assetId}`, {
    method: "DELETE",
  });
  return parseResponse<PublicationDraft>(response);
}

export async function submitPublicationTask(
  draftId: string,
  mode: PublicationMode,
  scheduledAt?: string,
): Promise<PublicationTask> {
  const response = await fetch(`${API_BASE}/publication/drafts/${draftId}/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode,
      scheduled_at: scheduledAt || null,
    }),
  });
  return requirePublicationTask(await parseResponse<unknown>(response));
}

/** 读取发布任务并拒绝未知的冻结连接方式。 */
export async function listPublicationTasks(): Promise<PublicationTask[]> {
  const response = await fetch(`${API_BASE}/publication/tasks`);
  const value = await parseResponse<unknown>(response);
  if (!Array.isArray(value)) throw new UserFacingError("发布任务列表结构无效");
  return value.map(requirePublicationTask);
}

/** 显式重试明确失败且允许重试的发布任务。 */
export async function retryPublicationTask(taskId: string): Promise<PublicationTask> {
  const response = await fetch(`${API_BASE}/publication/tasks/${taskId}/retry`, { method: "POST" });
  return requirePublicationTask(await parseResponse<unknown>(response));
}

/** 显式确认验证已完成，并恢复同一软件自带浏览器页面中的发布任务。 */
export async function resumePublicationVerification(
  taskId: string,
): Promise<PublicationVerificationResumeResult> {
  const response = await fetch(`${API_BASE}/publication/tasks/${taskId}/verification/resume`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirmed: true }),
  });
  return parseResponse<PublicationVerificationResumeResult>(response);
}

/** 提交人工核对结论，使不确定发布任务进入明确终态。 */
export async function reviewPublicationTask(
  taskId: string,
  published: boolean,
): Promise<PublicationTask> {
  const response = await fetch(`${API_BASE}/publication/tasks/${taskId}/review`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      decision: published ? "published" : "not_published",
    }),
  });
  return requirePublicationTask(await parseResponse<unknown>(response));
}

/** 取消尚未产生平台写入的发布任务。 */
export async function cancelPublicationTask(taskId: string): Promise<PublicationTask> {
  const response = await fetch(`${API_BASE}/publication/tasks/${taskId}/cancel`, {
    method: "POST",
  });
  return requirePublicationTask(await parseResponse<unknown>(response));
}

function requirePublicationTask(value: unknown): PublicationTask {
  if (
    !value ||
    typeof value !== "object" ||
    !("target_driver" in value) ||
    !isBrowserDriver(value.target_driver)
  ) {
    throw new UserFacingError("发布任务返回了不支持的连接方式");
  }
  return value as PublicationTask;
}
