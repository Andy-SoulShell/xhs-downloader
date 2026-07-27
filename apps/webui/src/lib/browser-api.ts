import type { JsonValue } from "@xhs-downloader/contracts";

import type {
  BrowserDriver,
  BrowserTask,
  BrowserTaskStatus,
  RouteStrategy,
} from "./types";
import { API_BASE, parseResponse } from "./http";
import { UserFacingError } from "./error-message";

/** 统一只读能力实际使用的提供方。 */
export type CapabilityProvider = "http" | "browser";

/** 跨提供方回退前的脱敏账号比较结论。 */
export type AccountConsistencyStatus =
  | "matched"
  | "different"
  | "logged_out"
  | "unverified";

/** 首选提供方安全回退前的结构化失败。 */
export interface RouteFallbackReason {
  provider: CapabilityProvider;
  code:
    | "unavailable"
    | "not_configured"
    | "authentication_expired"
    | "unsupported"
    | "page_incompatible"
    | "timeout_before_effect"
    | "effect_uncertain"
    | "invalid_result";
  message: string;
}

/** 一次只读能力调用的实际路由轨迹。 */
export interface CapabilityRoute {
  provider: CapabilityProvider;
  strategy: RouteStrategy;
  browser_driver: BrowserDriver | null;
  fallback_used: boolean;
  fallback_reason: RouteFallbackReason | null;
  attempted_providers: CapabilityProvider[];
  account_consistency: AccountConsistencyStatus | null;
}

/** 统一只读能力返回的数据和路由轨迹。 */
export interface ReadCapabilityResult<T> {
  data: T;
  route: CapabilityRoute;
}

/** 登录和写操作完成后的浏览器任务与类型化结果。 */
export interface BrowserOperationResult<T> {
  task: BrowserTask;
  data: T;
}

/** Cookie 清理后的目标会话状态。 */
export interface CookieDeletionResult {
  target: "browser" | "http";
  status: BrowserTaskStatus;
  deleted: boolean;
  message: string;
  task_id: string | null;
  restart_required: boolean;
}

/** 同步调用可在 HTTP 与浏览器间安全路由的只读能力。 */
export async function executeReadCapability<T>(
  path: string,
  payload: Record<string, JsonValue>,
  signal?: AbortSignal,
): Promise<ReadCapabilityResult<T>> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...payload,
      request_id: crypto.randomUUID(),
    }),
    signal,
  });
  return parseResponse<ReadCapabilityResult<T>>(response);
}

/** 提交并等待登录或写入类浏览器任务。 */
export async function executeBrowserOperation<T>(
  path: string,
  payload: Record<string, JsonValue>,
  signal?: AbortSignal,
): Promise<BrowserOperationResult<T>> {
  const response = await fetch(`${API_BASE}${path}?wait_seconds=60`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...payload,
      request_id: crypto.randomUUID(),
    }),
    signal,
  });
  const task = await parseResponse<BrowserTask>(response);
  if (task.status === "succeeded" && task.result) {
    return { task, data: task.result as T };
  }
  if (task.status === "failed" || task.status === "needs_review") {
    throw new UserFacingError(task.message);
  }
  throw new UserFacingError(`浏览器执行器尚未完成任务 ${task.task_id.slice(0, 8)}`);
}

/** 显式确认后清理指定登录会话的 Cookie。 */
export async function deleteCookies(
  target: "browser" | "http",
  signal?: AbortSignal,
): Promise<CookieDeletionResult> {
  const response = await fetch(
    `${API_BASE}/xhs/login/cookies/delete?wait_seconds=60`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        target,
        confirmed: true,
        request_id: crypto.randomUUID(),
      }),
      signal,
    },
  );
  const result = await parseResponse<CookieDeletionResult>(response);
  if (result.status === "succeeded" && result.deleted) return result;
  if (result.status === "failed" || result.status === "needs_review") {
    throw new UserFacingError(result.message);
  }
  throw new UserFacingError(
    `浏览器执行器尚未完成 Cookie 清理${result.task_id ? ` ${result.task_id.slice(0, 8)}` : ""}`,
  );
}
