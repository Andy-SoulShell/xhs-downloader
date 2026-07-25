import type { JsonValue } from "@xhs-downloader/contracts";

const STORAGE_KEY = "browserFailureArtifacts";
const MAX_ARTIFACTS = 2;
const MAX_SCREENSHOT_LENGTH = 1_500_000;
const INSTALL_REDACTION = `(() => {
  const id = "xhd-failure-redaction";
  if (document.getElementById(id)) return;
  const style = document.createElement("style");
  style.id = id;
  style.textContent = \`
    *, *::before, *::after {
      color: transparent !important;
      text-shadow: none !important;
      background-image: none !important;
    }
    img, video, canvas, svg, iframe {
      visibility: hidden !important;
    }
  \`;
  document.documentElement.append(style);
})()`;
const REMOVE_REDACTION =
  'document.getElementById("xhd-failure-redaction")?.remove()';

interface StoredFailureArtifact {
  taskId: string;
  createdAt: string;
  screenshot: string;
  diagnostics: Record<string, JsonValue>;
}

/** 在失败页面生成脱敏截图，仅保存在扩展本机存储中。 */
export async function captureRedactedFailure(
  tabId: number,
  taskId: string,
  diagnostics: Record<string, JsonValue> = {},
): Promise<Record<string, JsonValue> | undefined> {
  if (!chrome.debugger?.attach || !chrome.storage?.local) return undefined;
  const target = { tabId };
  let attached = false;
  try {
    await chrome.debugger.attach(target, "1.3");
    attached = true;
    await chrome.debugger.sendCommand(target, "Runtime.evaluate", {
      expression: INSTALL_REDACTION,
    });
    const response = (await chrome.debugger.sendCommand(
      target,
      "Page.captureScreenshot",
      {
        captureBeyondViewport: false,
        format: "jpeg",
        fromSurface: true,
        quality: 25,
      },
    )) as { data?: string };
    if (!response.data || response.data.length > MAX_SCREENSHOT_LENGTH) {
      return undefined;
    }
    const createdAt = new Date().toISOString();
    const artifact: StoredFailureArtifact = {
      taskId,
      createdAt,
      screenshot: `data:image/jpeg;base64,${response.data}`,
      diagnostics,
    };
    const current = await loadArtifacts();
    await chrome.storage.local.set({
      [STORAGE_KEY]: [artifact, ...current].slice(0, MAX_ARTIFACTS),
    });
    return {
      local_artifact_id: `${taskId}:${createdAt}`,
      redacted_screenshot_saved: true,
    };
  } catch {
    return undefined;
  } finally {
    if (attached) {
      await chrome.debugger
        .sendCommand(target, "Runtime.evaluate", {
          expression: REMOVE_REDACTION,
        })
        .catch(() => undefined);
      await chrome.debugger.detach(target).catch(() => undefined);
    }
  }
}

async function loadArtifacts(): Promise<StoredFailureArtifact[]> {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const value = stored[STORAGE_KEY];
  if (!Array.isArray(value)) return [];
  return value.filter(isStoredArtifact).slice(0, MAX_ARTIFACTS - 1);
}

function isStoredArtifact(value: unknown): value is StoredFailureArtifact {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<StoredFailureArtifact>;
  return (
    typeof item.taskId === "string" &&
    typeof item.createdAt === "string" &&
    typeof item.screenshot === "string" &&
    Boolean(item.diagnostics && typeof item.diagnostics === "object")
  );
}
