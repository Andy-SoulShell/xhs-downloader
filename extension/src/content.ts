import styleText from "./panel.css";
import { renderPanel } from "./panel";
import { parseCurrentDocument } from "./parser";
import type {
  DownloadPreference,
  ExtensionRequest,
  ExtensionResponse,
  ExtensionState,
} from "./types";

const host = document.createElement("div");
host.id = "xhs-downloader-extension";
const root = host.attachShadow({ mode: "closed" });
const style = document.createElement("style");
style.textContent = styleText;
const launcher = document.createElement("button");
launcher.className = "xhd-launcher";
launcher.type = "button";
launcher.textContent = "下载";
launcher.ariaLabel = "打开 xhs-downloader";
root.append(style, launcher);
document.documentElement.append(host);

launcher.addEventListener("click", () => void togglePanel());
chrome.runtime.onMessage.addListener((message: { type?: string }) => {
  if (message.type === "toggle-panel") void togglePanel();
});

async function togglePanel(): Promise<void> {
  const existing = root.querySelector(".xhd-panel");
  if (existing) {
    existing.remove();
    launcher.hidden = false;
    return;
  }
  try {
    const work = parseCurrentDocument(document, location.href);
    if (!work.media.length) throw new Error("当前帖子没有可下载媒体");
    const response = await send({ type: "get-state" });
    if (!response.state) throw new Error(response.message);
    launcher.hidden = true;
    renderPanel(root, work, response.state, {
      close: closePanel,
      download: (indexes) =>
        send({ type: "download", work, indexes }),
      setMode: async (mode: DownloadPreference) => {
        const result = await send({ type: "set-mode", mode });
        return result;
      },
      sync: () => send({ type: "sync-records" }),
    });
  } catch (error) {
    showTransientError(
      error instanceof Error ? error.message : "当前帖子解析失败",
    );
  }
}

function closePanel(): void {
  root.querySelector(".xhd-panel")?.remove();
  launcher.hidden = false;
}

async function send(request: ExtensionRequest): Promise<ExtensionResponse> {
  try {
    return await chrome.runtime.sendMessage<
      ExtensionRequest,
      ExtensionResponse
    >(request);
  } catch {
    return { ok: false, message: "扩展后台未响应，请重新加载扩展" };
  }
}

function showTransientError(message: string): void {
  const notice = document.createElement("div");
  notice.className = "xhd-notice";
  notice.textContent = message;
  root.append(notice);
  window.setTimeout(() => notice.remove(), 3600);
}
