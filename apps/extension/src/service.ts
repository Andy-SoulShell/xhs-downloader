import type {
  ClientDownloadRecord,
  ExtensionMedia,
  ExtensionWork,
  MediaKind,
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
    return (payload.protocol_version ?? 0) >= 1;
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

export async function requestWorkDetail(
  baseUrl: string,
  sourceUrl: string,
): Promise<ExtensionWork> {
  const response = await fetch(`${normalizeBase(baseUrl)}/xhs/detail`, {
    method: "POST",
    credentials: "omit",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: sourceUrl, download: false }),
  });
  const payload = (await response.json().catch(() => null)) as
    | DetailPayload
    | null;
  if (!response.ok) {
    throw new Error(
      payload?.message || payload?.detail || `帖子解析失败（HTTP ${response.status}）`,
    );
  }
  if (!payload?.data) throw new Error("本地服务没有返回帖子数据");
  const expectedId = workIdFromUrl(sourceUrl);
  if (payload.data.作品ID !== expectedId) {
    throw new Error("本地服务返回的帖子与当前链接不一致");
  }
  return {
    workId: payload.data.作品ID,
    sourceUrl,
    title: payload.data.作品标题,
    description: payload.data.作品描述,
    authorName: payload.data.作者.作者昵称 || payload.data.作者.作者ID,
    authorAvatar: payload.data.作者.头像地址 || undefined,
    media: payload.data.媒体.map(toExtensionMedia),
  };
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

interface DetailPayload {
  message?: string;
  detail?: string;
  data?: {
    作品ID: string;
    作品标题: string;
    作品描述: string;
    作者: {
      作者ID: string;
      作者昵称: string;
      头像地址?: string | null;
    };
    媒体: Array<{
      序号: number;
      类型: "视频" | "图片" | "动态图片";
      地址: string;
      扩展名: string;
      预览地址?: string | null;
    }>;
  } | null;
}

function toExtensionMedia(
  media: NonNullable<DetailPayload["data"]>["媒体"][number],
): ExtensionMedia {
  return {
    index: media.序号,
    kind: mediaKind(media.类型),
    url: media.地址,
    suffix: media.扩展名,
    previewUrl: media.预览地址 || undefined,
  };
}

function mediaKind(value: "视频" | "图片" | "动态图片"): MediaKind {
  if (value === "视频") return "video";
  if (value === "动态图片") return "live";
  return "image";
}

function workIdFromUrl(value: string): string {
  return new URL(value).pathname.split("/").filter(Boolean).at(-1) ?? "";
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
