import {
  claimPublicationTask,
  fetchPublicationAssetChunk,
  PublicationUnauthorizedError,
  registerPublicationExtension,
  reportPublicationStatus,
  supportsPublication,
} from "./publication-service";
import {
  clearActivePublicationClaim,
  clearPublicationCredential,
  loadActivePublicationClaim,
  loadActivePublicationOwner,
  loadPublicationCredential,
  saveActivePublicationClaim,
  saveActivePublicationOwner,
  savePublicationCredential,
} from "./publication-storage";
import type {
  ExtensionCredential,
  PublicationClaim,
  PublicationRequest,
  PublicationResponse,
  PublicationTaskStatus,
} from "./publication-types";
import { loadSettings } from "./storage";

const POLL_ALARM = "publication-poll";
const CREATOR_URL = "https://creator.xiaohongshu.com/publish";
const TERMINAL = new Set<PublicationTaskStatus>([
  "published",
  "needs_review",
  "failed",
  "canceled",
]);

let claimOperation: Promise<PublicationClaim | null> | undefined;
interface PreparedPublication {
  claim: PublicationClaim;
  isNew: boolean;
}

export function installPublicationAutomation(): void {
  chrome.runtime.onInstalled.addListener(() => void configurePolling());
  chrome.runtime.onStartup.addListener(() => void configurePolling());
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === POLL_ALARM) void pollPublicationTasks();
  });
  void configurePolling();
}

export async function handlePublicationRequest(
  request: PublicationRequest,
  senderTabId?: number,
): Promise<PublicationResponse> {
  if (request.type === "publication-prepare") {
    const prepared = await preparePublication(
      request.preferredTaskId,
      senderTabId,
    );
    return {
      ok: Boolean(prepared),
      message: prepared ? "发布任务已准备" : "没有待发布任务",
      claim: prepared?.claim,
    };
  }
  if (request.type === "publication-status") {
    const task = await withCredential((baseUrl, credential) =>
      reportPublicationStatus(
        baseUrl,
        credential,
        request.taskId,
        request.leaseToken,
        request.status,
        request.message,
        request.resultUrl,
      ),
    );
    if (TERMINAL.has(task.status)) {
      await clearActivePublicationClaim();
    } else {
      await saveActivePublicationClaim({
        task,
        lease_token: request.leaseToken,
      });
    }
    return { ok: true, message: task.message };
  }
  const chunk = await withCredential((baseUrl, credential) =>
    fetchPublicationAssetChunk(
      baseUrl,
      credential,
      request.taskId,
      request.leaseToken,
      request.assetId,
      request.offset,
    ),
  );
  return { ok: true, message: "素材分段读取完成", chunk };
}

async function configurePolling(): Promise<void> {
  await chrome.alarms.create(POLL_ALARM, {
    delayInMinutes: 0.1,
    periodInMinutes: 0.5,
  });
  await pollPublicationTasks();
}

async function pollPublicationTasks(): Promise<void> {
  try {
    const settings = await loadSettings();
    if (!(await supportsPublication(settings.serviceUrl))) return;
    const prepared = await preparePublication();
    if (!prepared?.isNew) return;
    const url = new URL(CREATOR_URL);
    url.searchParams.set("xhd_task", prepared.claim.task.task_id);
    const tab = await chrome.tabs.create({ url: url.toString(), active: false });
    if (tab.id !== undefined) await saveActivePublicationOwner(tab.id);
  } catch {
    // 服务离线、未授权或暂时不可用时保留任务，下一次闹钟会继续尝试。
  }
}

async function preparePublication(
  preferredTaskId?: string,
  senderTabId?: number,
): Promise<PreparedPublication | null> {
  const active = await validActiveClaim(preferredTaskId, senderTabId);
  if (active) return { claim: active, isNew: false };
  if (!claimOperation) {
    claimOperation = withCredential((baseUrl, credential) =>
      claimPublicationTask(baseUrl, credential, preferredTaskId),
    ).finally(() => {
      claimOperation = undefined;
    });
  }
  const claim = await claimOperation;
  if (claim) {
    await saveActivePublicationClaim(claim);
    if (senderTabId !== undefined) {
      await saveActivePublicationOwner(senderTabId);
    }
  }
  if (!claim && preferredTaskId) {
    throw new Error("指定发布任务尚未就绪或已由其他页面领取");
  }
  if (claim && preferredTaskId && claim.task.task_id !== preferredTaskId) {
    throw new Error("已有另一项发布任务正在执行");
  }
  return claim ? { claim, isNew: true } : null;
}

async function validActiveClaim(
  preferredTaskId?: string,
  senderTabId?: number,
): Promise<PublicationClaim | undefined> {
  const claim = await loadActivePublicationClaim();
  if (!claim) return undefined;
  const expiresAt = Date.parse(claim.task.lease_expires_at ?? "");
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    await clearActivePublicationClaim();
    return undefined;
  }
  if (preferredTaskId && claim.task.task_id !== preferredTaskId) {
    throw new Error("已有另一项发布任务正在执行");
  }
  const ownerTabId = await loadActivePublicationOwner();
  if (
    ownerTabId !== undefined &&
    senderTabId !== undefined &&
    ownerTabId !== senderTabId
  ) {
    throw new Error("该发布任务已由另一个创作页执行");
  }
  if (ownerTabId === undefined && senderTabId !== undefined) {
    await saveActivePublicationOwner(senderTabId);
  }
  return claim;
}

async function withCredential<T>(
  operation: (
    baseUrl: string,
    credential: ExtensionCredential,
  ) => Promise<T>,
): Promise<T> {
  const settings = await loadSettings();
  let credential = await ensureCredential(settings.serviceUrl);
  try {
    return await operation(settings.serviceUrl, credential);
  } catch (error) {
    if (!(error instanceof PublicationUnauthorizedError)) throw error;
    await clearPublicationCredential();
    credential = await ensureCredential(settings.serviceUrl);
    return operation(settings.serviceUrl, credential);
  }
}

async function ensureCredential(
  baseUrl: string,
): Promise<ExtensionCredential> {
  const extensionId = chrome.runtime.id;
  const stored = await loadPublicationCredential();
  if (stored?.extensionId === extensionId) return stored;
  const credential = await registerPublicationExtension(baseUrl, extensionId);
  await savePublicationCredential(credential);
  return credential;
}
