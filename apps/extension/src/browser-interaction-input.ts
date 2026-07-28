type BrowserInteractionKind = "like" | "favorite";

/** 内容脚本请求后台执行一次受控的可信互动点击。 */
export interface BrowserInteractionRequest {
  type: "browser-interaction-activate";
  taskId: string;
  kind: BrowserInteractionKind;
}

/** 后台可信互动点击的执行结果。 */
export interface BrowserInteractionResponse {
  ok: boolean;
  message: string;
}

interface AuthorizedInteraction {
  taskId: string;
  kind: BrowserInteractionKind;
}

interface ControlPoint {
  x: number;
  y: number;
}

const XHS_ORIGIN = "https://www.xiaohongshu.com";
const SELECTORS: Record<BrowserInteractionKind, string> = {
  like: ".interact-container .left .like-lottie",
  favorite: ".interact-container .left .reds-icon.collect-icon",
};
const CLICK_SETTLE_MS = 250;
const authorized = new Map<number, AuthorizedInteraction>();

/** 判断运行时消息是否为可信互动点击请求。 */
export function isBrowserInteractionRequest(request: {
  type?: string;
}): request is BrowserInteractionRequest {
  return request.type === "browser-interaction-activate";
}

/** 按任务类型授权互动，并返回幂等的撤销函数。 */
export function authorizeBrowserTaskInteraction(
  tabId: number,
  taskId: string,
  taskKind: string,
): () => void {
  const kind =
    taskKind === "set_like" ? "like" : taskKind === "set_favorite" ? "favorite" : undefined;
  if (!kind) return () => undefined;
  authorized.set(tabId, { taskId, kind });
  return () => {
    authorized.delete(tabId);
  };
}

/** 从内容脚本请求后台发送浏览器级可信点击。 */
export async function requestBrowserInteraction(
  taskId: string,
  kind: BrowserInteractionKind,
): Promise<void> {
  const response = (await chrome.runtime.sendMessage({
    type: "browser-interaction-activate",
    taskId,
    kind,
  } satisfies BrowserInteractionRequest)) as BrowserInteractionResponse;
  if (!response.ok) throw new Error(response.message);
}

/** 校验任务归属并在对应小红书标签页发送可信鼠标点击。 */
export async function handleBrowserInteractionRequest(
  request: BrowserInteractionRequest,
  senderTabId?: number,
  senderUrl?: string,
): Promise<BrowserInteractionResponse> {
  if (senderTabId === undefined) throw new Error("无法确认互动任务标签");
  const active = authorized.get(senderTabId);
  if (!active || active.taskId !== request.taskId || active.kind !== request.kind) {
    throw new Error("互动任务授权无效");
  }
  validateXhsFeedPage(senderUrl);
  await clickInteractionControl(senderTabId, request.kind);
  return { ok: true, message: "已通过受控输入触发互动" };
}

async function clickInteractionControl(tabId: number, kind: BrowserInteractionKind): Promise<void> {
  const target = { tabId };
  const previousTabId = (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;
  await chrome.debugger.attach(target, "1.3");
  try {
    await chrome.debugger.sendCommand(target, "Page.bringToFront");
    const point = await locateControl(target, SELECTORS[kind]);
    await dispatchMouse(target, "mouseMoved", point);
    await dispatchMouse(target, "mousePressed", point);
    await dispatchMouse(target, "mouseReleased", point);
    await delay(CLICK_SETTLE_MS);
  } finally {
    await chrome.debugger.detach(target).catch(() => undefined);
    if (previousTabId !== undefined && previousTabId !== tabId) {
      await chrome.tabs.update(previousTabId, { active: true }).catch(() => undefined);
    }
  }
}

async function locateControl(
  target: chrome.debugger.Debuggee,
  selector: string,
): Promise<ControlPoint> {
  const expression = `(() => {
    const control = document.querySelector(${JSON.stringify(selector)});
    if (!(control instanceof Element)) {
      return {ok:false,message:"页面没有可用的互动按钮"};
    }
    const target = control.closest("button,[role=button]") || control;
    target.scrollIntoView({block:"center",inline:"nearest"});
    const rect = target.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return {ok:false,message:"互动按钮当前不可见"};
    }
    return {
      ok:true,
      x:rect.left + rect.width / 2,
      y:rect.top + rect.height / 2
    };
  })()`;
  const response = await chrome.debugger.sendCommand(target, "Runtime.evaluate", {
    expression,
    returnByValue: true,
  });
  const value = (
    response as {
      result?: {
        value?: { ok?: boolean; message?: string; x?: number; y?: number };
      };
    }
  ).result?.value;
  if (value?.ok !== true) {
    throw new Error(value?.message || "无法定位互动按钮");
  }
  if (!Number.isFinite(value.x) || !Number.isFinite(value.y)) {
    throw new Error("互动按钮没有可用坐标");
  }
  return { x: value.x as number, y: value.y as number };
}

async function dispatchMouse(
  target: chrome.debugger.Debuggee,
  type: "mouseMoved" | "mousePressed" | "mouseReleased",
  point: ControlPoint,
): Promise<void> {
  await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", {
    type,
    x: point.x,
    y: point.y,
    button: type === "mouseMoved" ? "none" : "left",
    buttons: type === "mousePressed" ? 1 : 0,
    clickCount: type === "mouseMoved" ? 0 : 1,
    pointerType: "mouse",
  });
}

function validateXhsFeedPage(senderUrl?: string): void {
  const url = senderUrl ? new URL(senderUrl) : undefined;
  if (url?.origin !== XHS_ORIGIN || !url.pathname.startsWith("/explore/")) {
    throw new Error("只能在小红书帖子详情页执行互动");
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
