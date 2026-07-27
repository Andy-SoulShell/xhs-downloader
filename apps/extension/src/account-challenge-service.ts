import { BrowserTaskUnauthorizedError } from "./browser-task-service";
import type { ExtensionCredential } from "./publication-types";

const CLAIM_TIMEOUT_PADDING_MS = 5_000;

/** 本机服务下发给扩展的一次性账号挑战。 */
export interface ExtensionAccountChallengeClaim {
  challenge_id: string;
  algorithm: "HMAC-SHA-256";
  challenge_key: string;
  expires_at: string;
  lease_token: string;
}

/** 扩展回传给本机服务的脱敏账号证明。 */
export type ExtensionAccountChallengeAnswer =
  { status: "proved"; proof: string } | { status: "logged_out" } | { status: "unverified" };

/** 检查本机服务是否支持不落盘的账号挑战协议。 */
export async function supportsAccountChallenges(baseUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${normalizeBase(baseUrl)}/extension/capabilities`, {
      cache: "no-store",
      credentials: "omit",
      signal: AbortSignal.timeout(1_200),
    });
    if (!response.ok) return false;
    const payload = (await response.json()) as {
      protocol_version?: number;
      features?: Record<string, boolean>;
    };
    return (payload.protocol_version ?? 0) >= 5 && payload.features?.account_challenge === true;
  } catch {
    return false;
  }
}

/** 长轮询领取只存在于本机内存中的一次性账号挑战。 */
export async function claimAccountChallenge(
  baseUrl: string,
  credential: ExtensionCredential,
  waitSeconds = 25,
): Promise<ExtensionAccountChallengeClaim | null> {
  if (!Number.isFinite(waitSeconds) || waitSeconds < 0 || waitSeconds > 30) {
    throw new Error("账号挑战领取等待时间必须在 0 到 30 秒之间");
  }
  const response = await fetch(
    `${normalizeBase(baseUrl)}/browser/extension/account-challenges/claim?wait_seconds=${waitSeconds}`,
    {
      method: "POST",
      credentials: "omit",
      headers: extensionHeaders(credential),
      signal: AbortSignal.timeout(waitSeconds * 1_000 + CLAIM_TIMEOUT_PADDING_MS),
    },
  );
  return parseJsonResponse<ExtensionAccountChallengeClaim | null>(response);
}

/** 使用一次性租约回传页面生成的 HMAC 或稳定状态。 */
export async function answerAccountChallenge(
  baseUrl: string,
  credential: ExtensionCredential,
  claim: ExtensionAccountChallengeClaim,
  answer: ExtensionAccountChallengeAnswer,
): Promise<void> {
  const response = await fetch(
    `${normalizeBase(baseUrl)}/browser/extension/account-challenges/${claim.challenge_id}/answer`,
    {
      method: "POST",
      credentials: "omit",
      body: JSON.stringify(answer),
      headers: {
        ...extensionHeaders(credential),
        "Content-Type": "application/json",
        "X-Account-Challenge-Lease": claim.lease_token,
      },
      signal: AbortSignal.timeout(5_000),
    },
  );
  if (response.status === 401) throw new BrowserTaskUnauthorizedError();
  if (!response.ok) throw new Error(await responseMessage(response));
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  if (response.status === 401) throw new BrowserTaskUnauthorizedError();
  const payload = (await response.json().catch(() => null)) as T | null;
  if (!response.ok) {
    throw new Error(
      messageFromPayload(payload) || `本地账号挑战服务错误（HTTP ${response.status}）`,
    );
  }
  return payload as T;
}

function extensionHeaders(credential: ExtensionCredential): Record<string, string> {
  return {
    Authorization: `Bearer ${credential.token}`,
    "X-Extension-Id": credential.extensionId,
    ...(credential.installationId ? { "X-Extension-Installation": credential.installationId } : {}),
  };
}

async function responseMessage(response: Response): Promise<string> {
  const payload = (await response.json().catch(() => null)) as unknown;
  return messageFromPayload(payload) || `本地账号挑战服务错误（HTTP ${response.status}）`;
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
