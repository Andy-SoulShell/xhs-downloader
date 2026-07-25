import type {
  BrowserTask,
  BrowserTaskClaim,
  BrowserTaskStatus,
  JsonValue,
} from "@xhs-downloader/contracts";

import type { ExtensionCredential } from "./publication-types";

/** 扩展首个任务领取请求的默认长轮询秒数。 */
export const BROWSER_TASK_CLAIM_WAIT_SECONDS = 25;
/** 扩展向本机服务登记能力令牌的最长等待毫秒数。 */
export const BROWSER_TASK_REGISTER_TIMEOUT_MS = 5_000;
const CLAIM_REQUEST_TIMEOUT_PADDING_MS = 5_000;

export class BrowserTaskUnauthorizedError extends Error {}

/** 服务端已拒绝当前任务租约，调用方不得继续回传普通结果。 */
export class BrowserTaskLeaseLostError extends Error {}

/** 检查本地服务是否支持通用浏览器任务协议。 */
export async function supportsBrowserTasks(baseUrl: string): Promise<boolean> {
  try {
    const response = await fetch(
      `${normalizeBase(baseUrl)}/extension/capabilities`,
      {
        cache: "no-store",
        credentials: "omit",
        signal: AbortSignal.timeout(1200),
      },
    );
    if (!response.ok) return false;
    const payload = (await response.json()) as {
      protocol_version?: number;
      features?: Record<string, boolean>;
    };
    return (
      (payload.protocol_version ?? 0) >= 4 &&
      payload.features?.browser_tasks === true
    );
  } catch {
    return false;
  }
}

/** 向本地服务登记扩展并取得一次性返回的能力令牌。 */
export async function registerBrowserExtension(
  baseUrl: string,
  extensionId: string,
): Promise<ExtensionCredential> {
  const payload = await requestJson<{ token?: string }>(
    `${normalizeBase(baseUrl)}/browser/extension/register`,
    {
      method: "POST",
      body: JSON.stringify({ extension_id: extensionId }),
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(BROWSER_TASK_REGISTER_TIMEOUT_MS),
    },
  );
  if (!payload.token) throw new Error("本地服务没有返回扩展能力令牌");
  return { extensionId, token: payload.token };
}

/** 长轮询领取最早排队的浏览器任务，默认最多等待二十五秒。 */
export async function claimBrowserTask(
  baseUrl: string,
  credential: ExtensionCredential,
  waitSeconds = BROWSER_TASK_CLAIM_WAIT_SECONDS,
): Promise<BrowserTaskClaim | null> {
  if (!Number.isFinite(waitSeconds) || waitSeconds < 0 || waitSeconds > 30) {
    throw new Error("任务领取等待时间必须在 0 到 30 秒之间");
  }
  const claim = await requestJson<BrowserTaskClaim | null>(
    `${normalizeBase(baseUrl)}/browser/extension/tasks/claim?wait_seconds=${waitSeconds}`,
    {
      method: "POST",
      headers: extensionHeaders(credential, true),
      signal: AbortSignal.timeout(
        waitSeconds * 1000 + CLAIM_REQUEST_TIMEOUT_PADDING_MS,
      ),
    },
  );
  if (claim && claim.task?.target_driver !== "extension") {
    throw new Error("本地服务返回了不属于扩展的浏览器任务");
  }
  return claim;
}

/** 回传浏览器任务运行状态并续租。 */
export async function reportBrowserTaskRunning(
  baseUrl: string,
  credential: ExtensionCredential,
  taskId: string,
  leaseToken: string,
  signal?: AbortSignal,
): Promise<BrowserTask> {
  return requestJson<BrowserTask>(
    `${normalizeBase(baseUrl)}/browser/extension/tasks/${taskId}/status`,
    {
      method: "POST",
      body: JSON.stringify({
        status: "running",
        message: "浏览器扩展正在执行任务",
      }),
      headers: leasedHeaders(credential, leaseToken),
      signal,
    },
  );
}

/** 回传浏览器任务终态和经过验证的结构化结果。 */
export async function reportBrowserTaskResult(
  baseUrl: string,
  credential: ExtensionCredential,
  taskId: string,
  leaseToken: string,
  status: Extract<
    BrowserTaskStatus,
    "succeeded" | "failed" | "needs_review"
  >,
  message: string,
  result?: Record<string, JsonValue>,
  signal?: AbortSignal,
): Promise<BrowserTask> {
  return requestJson<BrowserTask>(
    `${normalizeBase(baseUrl)}/browser/extension/tasks/${taskId}/result`,
    {
      method: "POST",
      body: JSON.stringify({ status, message, result: result ?? null }),
      headers: leasedHeaders(credential, leaseToken),
      signal,
    },
  );
}

function leasedHeaders(
  credential: ExtensionCredential,
  leaseToken: string,
): Record<string, string> {
  return {
    ...extensionHeaders(credential, true),
    "X-Browser-Lease": leaseToken,
  };
}

function extensionHeaders(
  credential: ExtensionCredential,
  json = false,
): Record<string, string> {
  return {
    ...(json ? { "Content-Type": "application/json" } : {}),
    Authorization: `Bearer ${credential.token}`,
    "X-Extension-Id": credential.extensionId,
  };
}

async function requestJson<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, credentials: "omit" });
  if (response.status === 401) throw new BrowserTaskUnauthorizedError();
  const payload = (await response.json().catch(() => null)) as T | null;
  if (!response.ok) {
    const message =
      messageFromPayload(payload) ||
      `本地浏览器任务服务错误（HTTP ${response.status}）`;
    if (response.status === 409) throw new BrowserTaskLeaseLostError(message);
    throw new Error(message);
  }
  return payload as T;
}

function messageFromPayload(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const value = payload as { message?: unknown; detail?: unknown };
  if (typeof value.message === "string") return value.message;
  return typeof value.detail === "string" ? value.detail : undefined;
}

function normalizeBase(value: string): string {
  return value.replace(/\/+$/, "");
}
