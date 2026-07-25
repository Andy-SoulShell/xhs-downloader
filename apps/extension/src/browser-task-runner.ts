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
        response.ok ? "succeeded" : "failed",
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
        "failed",
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
  const tabs = (await chrome.tabs.query({}))
    .filter((item) => item.id !== undefined)
    .sort((left, right) => Number(right.active) - Number(left.active));
  for (const tab of tabs) {
    try {
      return await chrome.tabs.sendMessage<
        BrowserPageTaskRequest,
        BrowserPageTaskResponse
      >(tab.id as number, request);
    } catch {
      // 只有已注入小红书内容脚本的标签页会响应。
    }
  }
  const tab = await chrome.tabs.create({ url: EXPLORE_URL, active: false });
  if (tab.id === undefined) throw new Error("无法创建小红书任务页面");
  return sendWhenReady(tab.id, request);
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
