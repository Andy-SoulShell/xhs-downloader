import type {
  ExtensionCredential,
  PublicationAssetChunk,
  PublicationClaim,
  PublicationTask,
  PublicationTaskStatus,
} from "./publication-types";
import { supportsCapability, type ServiceCapabilities } from "./capability-negotiation";

const ASSET_CHUNK_SIZE = 256 * 1024;

export class PublicationUnauthorizedError extends Error {}

export async function supportsPublication(baseUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${normalizeBase(baseUrl)}/extension/capabilities`, {
      cache: "no-store",
      credentials: "omit",
      signal: AbortSignal.timeout(1200),
    });
    if (!response.ok) return false;
    return supportsCapability((await response.json()) as ServiceCapabilities, 2, "publication");
  } catch {
    return false;
  }
}

export async function registerPublicationExtension(
  baseUrl: string,
  extensionId: string,
  installationId?: string,
): Promise<ExtensionCredential> {
  const payload = await requestJson<{ token?: string }>(
    `${normalizeBase(baseUrl)}/publication/extension/register`,
    {
      method: "POST",
      body: JSON.stringify({
        extension_id: extensionId,
        ...(installationId ? { installation_id: installationId } : {}),
      }),
      headers: { "Content-Type": "application/json" },
    },
  );
  if (!payload.token) throw new Error("本地服务没有返回扩展能力令牌");
  return { extensionId, token: payload.token, installationId };
}

export async function claimPublicationTask(
  baseUrl: string,
  credential: ExtensionCredential,
  preferredTaskId?: string,
): Promise<PublicationClaim | null> {
  const claim = await requestJson<PublicationClaim | null>(
    `${normalizeBase(baseUrl)}/publication/extension/claim`,
    {
      method: "POST",
      body: JSON.stringify({
        preferred_task_id: preferredTaskId || null,
      }),
      headers: extensionHeaders(credential, true),
    },
  );
  if (claim?.task.target_driver === "managed") {
    throw new Error("本地服务返回了不属于扩展驱动的发布任务");
  }
  return claim;
}

export async function reportPublicationStatus(
  baseUrl: string,
  credential: ExtensionCredential,
  taskId: string,
  leaseToken: string,
  status: PublicationTaskStatus,
  message: string,
  resultUrl?: string,
): Promise<PublicationTask> {
  return requestJson<PublicationTask>(
    `${normalizeBase(baseUrl)}/publication/tasks/${taskId}/events`,
    {
      method: "POST",
      body: JSON.stringify({
        status,
        message,
        result_url: resultUrl || null,
      }),
      headers: {
        ...extensionHeaders(credential, true),
        "X-Publish-Lease": leaseToken,
      },
    },
  );
}

export async function fetchPublicationAssetChunk(
  baseUrl: string,
  credential: ExtensionCredential,
  taskId: string,
  leaseToken: string,
  assetId: string,
  offset: number,
): Promise<PublicationAssetChunk> {
  const end = offset + ASSET_CHUNK_SIZE - 1;
  const response = await fetch(
    `${normalizeBase(baseUrl)}/publication/tasks/${taskId}/assets/${assetId}`,
    {
      credentials: "omit",
      headers: {
        ...extensionHeaders(credential),
        "X-Publish-Lease": leaseToken,
        Range: `bytes=${offset}-${end}`,
      },
    },
  );
  if (response.status === 401) throw new PublicationUnauthorizedError();
  if (response.status !== 206) {
    throw new Error(await responseMessage(response, "素材分段读取失败"));
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  const range = parseContentRange(response.headers.get("Content-Range"));
  if (!range || range.start !== offset || bytes.length !== range.end - range.start + 1) {
    throw new Error("本地服务返回了无效的素材分段");
  }
  return {
    base64: bytesToBase64(bytes),
    offset,
    nextOffset: range.end + 1,
    total: range.total,
    done: range.end + 1 >= range.total,
  };
}

function extensionHeaders(credential: ExtensionCredential, json = false): Record<string, string> {
  return {
    ...(json ? { "Content-Type": "application/json" } : {}),
    Authorization: `Bearer ${credential.token}`,
    "X-Extension-Id": credential.extensionId,
    ...(credential.installationId ? { "X-Extension-Installation": credential.installationId } : {}),
  };
}

async function requestJson<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, credentials: "omit" });
  if (response.status === 401) throw new PublicationUnauthorizedError();
  const payload = (await response.json().catch(() => null)) as T | null;
  if (!response.ok) {
    throw new Error(messageFromPayload(payload) || `本地发布服务错误（HTTP ${response.status}）`);
  }
  return payload as T;
}

async function responseMessage(response: Response, fallback: string): Promise<string> {
  const payload = (await response.json().catch(() => null)) as unknown;
  return messageFromPayload(payload) || `${fallback}（HTTP ${response.status}）`;
}

function messageFromPayload(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const value = payload as { message?: unknown; detail?: unknown };
  if (typeof value.message === "string") return value.message;
  return typeof value.detail === "string" ? value.detail : undefined;
}

function parseContentRange(value: string | null): {
  start: number;
  end: number;
  total: number;
} | null {
  const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(value ?? "");
  if (!match) return null;
  return {
    start: Number(match[1]),
    end: Number(match[2]),
    total: Number(match[3]),
  };
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 32_768) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768));
  }
  return btoa(binary);
}

function normalizeBase(value: string): string {
  return value.replace(/\/+$/, "");
}
