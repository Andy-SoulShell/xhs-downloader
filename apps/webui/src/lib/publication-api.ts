import { API_BASE, parseResponse } from "./http";
import type {
  PublicationDraft,
  PublicationDraftInput,
  PublicationMode,
  PublicationTask,
  PublicationVerificationResumeResult,
} from "./publication";

export async function listPublicationDrafts(): Promise<PublicationDraft[]> {
  const response = await fetch(`${API_BASE}/publication/drafts`);
  return parseResponse<PublicationDraft[]>(response);
}

export async function createPublicationDraft(): Promise<PublicationDraft> {
  const response = await fetch(`${API_BASE}/publication/drafts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  return parseResponse<PublicationDraft>(response);
}

export async function updatePublicationDraft(
  draftId: string,
  input: PublicationDraftInput,
): Promise<PublicationDraft> {
  const response = await fetch(`${API_BASE}/publication/drafts/${draftId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return parseResponse<PublicationDraft>(response);
}

export async function deletePublicationDraft(
  draftId: string,
): Promise<void> {
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
  const response = await fetch(
    `${API_BASE}/publication/drafts/${draftId}/assets`,
    { method: "POST", body: data },
  );
  return parseResponse<PublicationDraft>(response);
}

export async function removePublicationAsset(
  draftId: string,
  assetId: string,
): Promise<PublicationDraft> {
  const response = await fetch(
    `${API_BASE}/publication/drafts/${draftId}/assets/${assetId}`,
    { method: "DELETE" },
  );
  return parseResponse<PublicationDraft>(response);
}

export async function submitPublicationTask(
  draftId: string,
  mode: PublicationMode,
  scheduledAt?: string,
): Promise<PublicationTask> {
  const response = await fetch(
    `${API_BASE}/publication/drafts/${draftId}/submit`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode,
        scheduled_at: scheduledAt || null,
      }),
    },
  );
  return parseResponse<PublicationTask>(response);
}

export async function listPublicationTasks(): Promise<PublicationTask[]> {
  const response = await fetch(`${API_BASE}/publication/tasks`);
  return parseResponse<PublicationTask[]>(response);
}

export async function retryPublicationTask(
  taskId: string,
): Promise<PublicationTask> {
  const response = await fetch(
    `${API_BASE}/publication/tasks/${taskId}/retry`,
    { method: "POST" },
  );
  return parseResponse<PublicationTask>(response);
}

/** 显式确认验证已完成，并恢复同一受管浏览器页面中的发布任务。 */
export async function resumePublicationVerification(
  taskId: string,
): Promise<PublicationVerificationResumeResult> {
  const response = await fetch(
    `${API_BASE}/publication/tasks/${taskId}/verification/resume`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmed: true }),
    },
  );
  return parseResponse<PublicationVerificationResumeResult>(response);
}

/** 提交人工核对结论，使不确定发布任务进入明确终态。 */
export async function reviewPublicationTask(
  taskId: string,
  published: boolean,
): Promise<PublicationTask> {
  const response = await fetch(
    `${API_BASE}/publication/tasks/${taskId}/review`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        decision: published ? "published" : "not_published",
      }),
    },
  );
  return parseResponse<PublicationTask>(response);
}

export async function cancelPublicationTask(
  taskId: string,
): Promise<PublicationTask> {
  const response = await fetch(
    `${API_BASE}/publication/tasks/${taskId}/cancel`,
    { method: "POST" },
  );
  return parseResponse<PublicationTask>(response);
}
