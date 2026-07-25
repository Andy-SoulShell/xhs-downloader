import type { BrowserTaskClaim } from "@xhs-downloader/contracts";

import type {
  BrowserPageTaskRequest,
  BrowserPageTaskResponse,
} from "./browser-page-runner";
import {
  BrowserTaskUnauthorizedError,
  claimBrowserTask,
  registerBrowserExtension,
  reportBrowserTaskResult,
  reportBrowserTaskRunning,
  supportsBrowserTasks,
} from "./browser-task-service";
import {
  clearExtensionCredential,
  ensureExtensionCredential,
} from "./extension-credential";
import type { ExtensionCredential } from "./publication-types";
import { loadSettings } from "./storage";

const POLL_ALARM = "browser-task-poll";
const EXPLORE_URL = "https://www.xiaohongshu.com/explore/";
const PAGE_READY_ATTEMPTS = 20;

let pollOperation: Promise<void> | undefined;

/** 安装通用浏览器任务的启动与定时轮询。 */
export function installBrowserTaskAutomation(): void {
  chrome.runtime.onInstalled.addListener(() => void configurePolling());
  chrome.runtime.onStartup.addListener(() => void configurePolling());
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === POLL_ALARM) void runBrowserTaskPoll();
  });
  void configurePolling();
}

async function configurePolling(): Promise<void> {
  await chrome.alarms.create(POLL_ALARM, {
    delayInMinutes: 0.1,
    periodInMinutes: 0.5,
  });
  await runBrowserTaskPoll();
}

/** 执行一次防重入的浏览器任务轮询。 */
export async function runBrowserTaskPoll(): Promise<void> {
  if (pollOperation) return pollOperation;
  pollOperation = performPoll().finally(() => {
    pollOperation = undefined;
  });
  return pollOperation;
}

async function performPoll(): Promise<void> {
  try {
    const settings = await loadSettings();
    if (!(await supportsBrowserTasks(settings.serviceUrl))) return;
    const claim = await withCredential((credential) =>
      claimBrowserTask(settings.serviceUrl, credential),
    );
    if (claim) await executeClaim(settings.serviceUrl, claim);
  } catch {
    // 服务离线、暂时无权限或页面未就绪时保留服务端任务等待下次轮询。
  }
}

async function executeClaim(
  baseUrl: string,
  claim: BrowserTaskClaim,
): Promise<void> {
  const taskId = claim.task.task_id;
  const lease = claim.lease_token;
  await withCredential((credential) =>
    reportBrowserTaskRunning(baseUrl, credential, taskId, lease),
  );
  try {
    const response = await executeInXhsTab(claim);
    await withCredential((credential) =>
      reportBrowserTaskResult(
        baseUrl,
        credential,
        taskId,
        lease,
        response.status ?? (response.ok ? "succeeded" : "failed"),
        response.message,
        response.result,
      ),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "浏览器任务执行失败";
    await withCredential((credential) =>
      reportBrowserTaskResult(
        baseUrl,
        credential,
        taskId,
        lease,
        isWriteTask(claim.task.kind) ? "needs_review" : "failed",
        message,
      ),
    );
  }
}

async function executeInXhsTab(
  claim: BrowserTaskClaim,
): Promise<BrowserPageTaskResponse> {
  const request: BrowserPageTaskRequest = {
    type: "browser-page-task",
    task: claim.task,
  };
  if (claim.task.kind === "check_login_status") {
    const tabs = (await chrome.tabs.query({}))
      .filter((item) => item.id !== undefined)
      .sort((left, right) => Number(right.active) - Number(left.active));
    for (const tab of tabs) {
      try {
        return await sendToTab(tab.id as number, request);
      } catch {
        // 只有已注入小红书内容脚本的标签页会响应。
      }
    }
  }
  return executeInNewTab(request);
}

async function executeInNewTab(
  request: BrowserPageTaskRequest,
): Promise<BrowserPageTaskResponse> {
  const targetUrl = taskTargetUrl(request.task);
  const tab = await chrome.tabs.create({ url: targetUrl, active: false });
  if (tab.id === undefined) throw new Error("无法创建小红书任务页面");
  try {
    let response = await sendWhenReady(tab.id, request);
    if (response.navigateUrl) {
      const navigateUrl = safeXhsUrl(response.navigateUrl);
      await chrome.tabs.update(tab.id, { url: navigateUrl });
      response = await sendWhenReady(tab.id, request);
    }
    return response;
  } finally {
    await chrome.tabs.remove(tab.id);
  }
}

async function sendToTab(
  tabId: number,
  request: BrowserPageTaskRequest,
): Promise<BrowserPageTaskResponse> {
  return chrome.tabs.sendMessage<
    BrowserPageTaskRequest,
    BrowserPageTaskResponse
  >(tabId, request);
}

async function sendWhenReady(
  tabId: number,
  request: BrowserPageTaskRequest,
): Promise<BrowserPageTaskResponse> {
  let lastError: unknown;
  for (let attempt = 0; attempt < PAGE_READY_ATTEMPTS; attempt += 1) {
    try {
      return await chrome.tabs.sendMessage<
        BrowserPageTaskRequest,
        BrowserPageTaskResponse
      >(tabId, request);
    } catch (error) {
      lastError = error;
      await delay(250);
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("小红书页面未能及时加载");
}

function taskTargetUrl(task: BrowserTaskClaim["task"]): string {
  if (task.kind === "check_login_status" || task.kind === "list_feeds") {
    return EXPLORE_URL;
  }
  if (task.kind === "search_feeds") {
    const keyword = taskPayloadText(task.payload, "keyword");
    return `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(keyword)}&source=web_explore_feed`;
  }
  if (task.kind === "get_user_profile") {
    const userId = taskPayloadText(task.payload, "user_id");
    const token = taskPayloadText(task.payload, "xsec_token");
    return `https://www.xiaohongshu.com/user/profile/${encodeURIComponent(userId)}?xsec_token=${encodeURIComponent(token)}&xsec_source=pc_note`;
  }
  if (
    task.kind === "get_feed_detail" ||
    task.kind === "set_like" ||
    task.kind === "set_favorite" ||
    task.kind === "post_comment" ||
    task.kind === "reply_comment"
  ) {
    const feedId = taskPayloadText(task.payload, "feed_id");
    const token = taskPayloadText(task.payload, "xsec_token");
    return `https://www.xiaohongshu.com/explore/${encodeURIComponent(feedId)}?xsec_token=${encodeURIComponent(token)}&xsec_source=pc_feed`;
  }
  if (task.kind === "get_my_profile") return EXPLORE_URL;
  throw new Error(`当前扩展版本尚未接入任务 ${task.kind}`);
}

function isWriteTask(kind: BrowserTaskClaim["task"]["kind"]): boolean {
  return ["set_like", "set_favorite", "post_comment", "reply_comment"].includes(
    kind,
  );
}

function taskPayloadText(
  payload: BrowserTaskClaim["task"]["payload"],
  field: string,
): string {
  const value = payload[field];
  if (typeof value !== "string" || !value) {
    throw new Error(`浏览器任务缺少参数 ${field}`);
  }
  return value;
}

function safeXhsUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== "www.xiaohongshu.com") {
    throw new Error("页面返回了不受支持的导航地址");
  }
  return url.toString();
}

async function withCredential<T>(
  operation: (credential: ExtensionCredential) => Promise<T>,
): Promise<T> {
  const settings = await loadSettings();
  let credential = await ensureCredential(settings.serviceUrl);
  try {
    return await operation(credential);
  } catch (error) {
    if (!(error instanceof BrowserTaskUnauthorizedError)) throw error;
    await clearExtensionCredential();
    credential = await ensureCredential(settings.serviceUrl);
    return operation(credential);
  }
}

async function ensureCredential(
  baseUrl: string,
): Promise<ExtensionCredential> {
  return ensureExtensionCredential(baseUrl, registerBrowserExtension);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
