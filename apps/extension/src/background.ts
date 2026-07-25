import {
  buildDownloadFilename,
  resolveDownloadMode,
} from "./mode";
import { installBrowserTaskAutomation } from "./browser-task-runner";
import {
  handleBrowserInteractionRequest,
  isBrowserInteractionRequest,
  type BrowserInteractionRequest,
  type BrowserInteractionResponse,
} from "./browser-interaction-input";
import {
  handlePublicationRequest,
  installPublicationAutomation,
} from "./publication-runner";
import {
  isPublicationRequest,
  type PublicationRequest,
  type PublicationResponse,
} from "./publication-types";
import {
  checkService,
  requestBackgroundDownload,
  requestWorkDetail,
  syncClientRecords,
} from "./service";
import {
  appendPendingRecord,
  loadPendingRecords,
  loadSettings,
  removePendingRecords,
  saveMode,
} from "./storage";
import type {
  ClientDownloadRecord,
  DownloadMode,
  ExtensionRequest,
  ExtensionResponse,
  ExtensionWork,
} from "./types";

chrome.action.onClicked.addListener((tab) => {
  if (tab.id) void chrome.tabs.sendMessage(tab.id, { type: "toggle-panel" });
});

chrome.runtime.onMessage.addListener(
  (
    request:
      | ExtensionRequest
      | PublicationRequest
      | BrowserInteractionRequest,
    sender,
    sendResponse: (
      response:
        | ExtensionResponse
        | PublicationResponse
        | BrowserInteractionResponse,
    ) => void,
  ) => {
    void handleRequest(request, sender.tab?.id, sender.url)
      .then(sendResponse)
      .catch((error: unknown) =>
        sendResponse({
          ok: false,
          message: error instanceof Error ? error.message : "扩展操作失败",
        }),
      );
    return true;
  },
);

async function handleRequest(
  request:
    | ExtensionRequest
    | PublicationRequest
    | BrowserInteractionRequest,
  senderTabId?: number,
  senderUrl?: string,
): Promise<
  ExtensionResponse | PublicationResponse | BrowserInteractionResponse
> {
  if (isBrowserInteractionRequest(request)) {
    return handleBrowserInteractionRequest(request, senderTabId, senderUrl);
  }
  if (isPublicationRequest(request)) {
    return handlePublicationRequest(request, senderTabId, senderUrl);
  }
  if (request.type === "set-mode") {
    await saveMode(request.mode);
    return { ok: true, message: "下载模式已更新" };
  }
  if (request.type === "sync-records") return syncPendingRecords();
  if (request.type === "resolve-work") {
    const settings = await loadSettings();
    const work = await requestWorkDetail(settings.serviceUrl, request.sourceUrl);
    return { ok: true, message: "当前帖子解析完成", work };
  }
  if (request.type === "download") {
    return download(request.work, request.indexes);
  }
  return getState();
}

installPublicationAutomation();
installBrowserTaskAutomation();

async function getState(): Promise<ExtensionResponse> {
  const settings = await loadSettings();
  const [online, records] = await Promise.all([
    checkService(settings.serviceUrl),
    loadPendingRecords(),
  ]);
  return {
    ok: true,
    message: online ? "本地服务已连接" : "本地服务未启动",
    state: {
      mode: settings.mode,
      online,
      pendingRecords: records.length,
    },
  };
}

async function download(
  work: ExtensionWork,
  indexes: number[],
): Promise<ExtensionResponse> {
  if (!indexes.length) throw new Error("请至少选择一项媒体");
  const settings = await loadSettings();
  const online = await checkService(settings.serviceUrl);
  const mode = resolveDownloadMode(settings.mode, online);
  if (mode === "background" && !online) {
    throw new Error("本地服务未启动，无法使用后台下载");
  }
  try {
    if (mode === "background") {
      const message = await requestBackgroundDownload(
        settings.serviceUrl,
        work,
        indexes,
        crypto.randomUUID(),
      );
      return { ok: true, message, mode };
    }
    const message = await downloadInBrowser(work, indexes);
    await saveRecord(work, indexes, mode, "completed", message, online);
    return { ok: true, message, mode };
  } catch (error) {
    const message = error instanceof Error ? error.message : "下载失败";
    if (mode === "browser") {
      await saveRecord(work, indexes, mode, "failed", message, online);
    }
    throw error;
  }
}

async function downloadInBrowser(
  work: ExtensionWork,
  indexes: number[],
): Promise<string> {
  const selected = new Set(indexes);
  const media = work.media.filter((item) => selected.has(item.index));
  if (!media.length) throw new Error("选中的媒体没有可下载资源");
  await Promise.all(
    media.map((item) =>
      chrome.downloads.download({
        conflictAction: "uniquify",
        filename: buildDownloadFilename(work.workId, item),
        saveAs: false,
        url: item.url,
      }),
    ),
  );
  return `已交给浏览器下载 ${media.length} 个文件`;
}

async function saveRecord(
  work: ExtensionWork,
  indexes: number[],
  mode: DownloadMode,
  status: ClientDownloadRecord["status"],
  message: string,
  serviceOnline: boolean,
): Promise<void> {
  const record: ClientDownloadRecord = {
    record_id: crypto.randomUUID(),
    work_id: work.workId,
    source_url: work.sourceUrl,
    title: work.title,
    mode,
    status,
    media_indexes: indexes,
    created_at: new Date().toISOString(),
    message,
  };
  await appendPendingRecord(record);
  if (serviceOnline && mode === "background") {
    try {
      const settings = await loadSettings();
      await syncClientRecords(settings.serviceUrl, [record]);
      await removePendingRecords([record.record_id]);
    } catch {
      // 下载结果已经确定；同步失败时保留本地记录，等待用户稍后重试。
    }
  }
}

async function syncPendingRecords(): Promise<ExtensionResponse> {
  const settings = await loadSettings();
  if (!(await checkService(settings.serviceUrl))) {
    throw new Error("本地服务未启动，暂时无法同步");
  }
  const count = await trySyncPendingRecords();
  return {
    ok: true,
    message: count ? `已同步 ${count} 条下载记录` : "没有待同步记录",
  };
}

async function trySyncPendingRecords(): Promise<number> {
  const [settings, records] = await Promise.all([
    loadSettings(),
    loadPendingRecords(),
  ]);
  if (!records.length) return 0;
  const accepted = await syncClientRecords(settings.serviceUrl, records);
  await removePendingRecords(records.map((record) => record.record_id));
  return accepted;
}
