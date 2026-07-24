import type {
  ClientDownloadRecord,
  ExtensionWork,
} from "./types";

export const DEFAULT_SERVICE_URL = "http://127.0.0.1:5556";

export async function checkService(baseUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${normalizeBase(baseUrl)}/extension/capabilities`, {
      cache: "no-store",
      credentials: "omit",
      signal: AbortSignal.timeout(1200),
    });
    if (!response.ok) return false;
    const payload = (await response.json()) as { protocol_version?: number };
    return payload.protocol_version === 1;
  } catch {
    return false;
  }
}

export async function requestBackgroundDownload(
  baseUrl: string,
  work: ExtensionWork,
  indexes: number[],
  requestId: string,
): Promise<string> {
  const response = await fetch(`${normalizeBase(baseUrl)}/tasks`, {
    method: "POST",
    credentials: "omit",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: work.sourceUrl,
      index: indexes,
      force: false,
      request_id: requestId,
    }),
  });
  const payload = (await response.json().catch(() => null)) as
    | { task_id?: string; message?: string }
    | null;
  if (!response.ok) {
    throw new Error(payload?.message || `后台下载失败（HTTP ${response.status}）`);
  }
  if (!payload?.task_id) throw new Error("后台没有返回任务标识");
  return `后台任务 ${payload.task_id.slice(0, 8)} 已提交`;
}

export async function syncClientRecords(
  baseUrl: string,
  records: ClientDownloadRecord[],
): Promise<number> {
  if (!records.length) return 0;
  let accepted = 0;
  for (let index = 0; index < records.length; index += 200) {
    accepted += await syncRecordBatch(baseUrl, records.slice(index, index + 200));
  }
  return accepted;
}

async function syncRecordBatch(
  baseUrl: string,
  records: ClientDownloadRecord[],
): Promise<number> {
  const response = await fetch(`${normalizeBase(baseUrl)}/extension/records`, {
    method: "POST",
    credentials: "omit",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ records }),
  });
  const payload = (await response.json().catch(() => null)) as
    | { accepted?: number; message?: string }
    | null;
  if (!response.ok) {
    throw new Error(payload?.message || `记录同步失败（HTTP ${response.status}）`);
  }
  return payload?.accepted ?? 0;
}

function normalizeBase(value: string): string {
  return value.replace(/\/+$/, "");
}
