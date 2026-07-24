const CREATOR_ORIGIN = "https://creator.xiaohongshu.com";
const CONTROL_EXPRESSION =
  "globalThis[Symbol.for('xhs-downloader.publisher-control')]?.()";

export async function activatePublicationControl(
  tabId: number,
  senderUrl?: string,
): Promise<void> {
  const url = senderUrl ? new URL(senderUrl) : undefined;
  if (url?.origin !== CREATOR_ORIGIN || !url.pathname.startsWith("/publish/")) {
    throw new Error("只能在小红书创作发布页执行发布");
  }
  const target = { tabId };
  await chrome.debugger.attach(target, "1.3");
  try {
    await chrome.debugger.sendCommand(target, "Page.bringToFront");
    await focusControl(target);
    await dispatchEnter(target, "rawKeyDown");
    await dispatchEnter(target, "keyUp");
  } finally {
    await chrome.debugger.detach(target).catch(() => undefined);
  }
}

async function focusControl(target: chrome.debugger.Debuggee): Promise<void> {
  const response = await chrome.debugger.sendCommand(
    target,
    "Runtime.evaluate",
    { expression: CONTROL_EXPRESSION, returnByValue: true },
  );
  const value = (
    response as {
      result?: {
        value?: {
          message?: string;
          ok?: boolean;
        };
      };
    }
  )?.result?.value;
  if (value?.ok !== true) {
    throw new Error(value?.message || "无法定位创作平台发布按钮");
  }
}

async function dispatchEnter(
  target: chrome.debugger.Debuggee,
  type: "rawKeyDown" | "keyUp",
): Promise<void> {
  await chrome.debugger.sendCommand(target, "Input.dispatchKeyEvent", {
    type,
    code: "Enter",
    key: "Enter",
    nativeVirtualKeyCode: 13,
    windowsVirtualKeyCode: 13,
  });
}
