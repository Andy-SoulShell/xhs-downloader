const CREATOR_ORIGIN = "https://creator.xiaohongshu.com";
const CONTROL_EXPRESSION =
  "globalThis[Symbol.for('xhs-downloader.publisher-control')]?.()";
const FALLBACK_EXPRESSION =
  "({path:location.pathname,result:globalThis[Symbol.for('xhs-downloader.publisher-control')]?.('activate')})";
const SCHEDULE_INPUT_EXPRESSION = `(() => {
  if (!location.pathname.startsWith("/publish/")) {
    return {ok:false,message:"只能在小红书创作发布页设置定时时间"};
  }
  const input = document.querySelector(".date-picker-container input");
  if (!(input instanceof HTMLInputElement)) {
    return {ok:false,message:"没有找到官方定时发布时间输入框"};
  }
  input.scrollIntoView({block:"center",inline:"nearest"});
  input.focus();
  input.select();
  return {ok:true};
})()`;
const SCHEDULE_VALUE_EXPRESSION = `(() => {
  const input = document.querySelector(".date-picker-container input");
  return input instanceof HTMLInputElement
    ? {ok:true,value:input.value}
    : {ok:false,message:"官方定时发布时间输入框已经消失"};
})()`;
const CONTROL_SETTLE_MS = 150;
const POINTER_MOVE_MS = 80;
const POINTER_PRESS_MS = 80;
const FALLBACK_CHECK_MS = 1_000;
const SCHEDULE_SETTLE_MS = 180;

export async function activatePublicationControl(
  tabId: number,
  senderUrl?: string,
): Promise<void> {
  validateCreatorPage(senderUrl);
  const target = { tabId };
  await chrome.debugger.attach(target, "1.3");
  try {
    await chrome.debugger.sendCommand(target, "Page.bringToFront");
    await locateControl(target);
    await delay(CONTROL_SETTLE_MS);
    const point = await locateControl(target);
    await dispatchMouse(target, "mouseMoved", point);
    await delay(POINTER_MOVE_MS);
    await dispatchMouse(target, "mousePressed", point);
    await delay(POINTER_PRESS_MS);
    await dispatchMouse(target, "mouseReleased", point);
    await delay(FALLBACK_CHECK_MS);
    await activateDomFallback(target);
  } finally {
    await chrome.debugger.detach(target).catch(() => undefined);
  }
}

/** 使用浏览器级可信输入填写官方定时时间。 */
export async function typePublicationSchedule(
  tabId: number,
  value: string,
  senderUrl?: string,
): Promise<void> {
  validateCreatorPage(senderUrl);
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(value)) {
    throw new Error("官方定时时间格式无效");
  }
  const target = { tabId };
  await chrome.debugger.attach(target, "1.3");
  try {
    await chrome.debugger.sendCommand(target, "Page.bringToFront");
    await requireEvaluation(target, SCHEDULE_INPUT_EXPRESSION);
    await chrome.debugger.sendCommand(target, "Input.insertText", { text: value });
    await dispatchTab(target, "keyDown");
    await dispatchTab(target, "keyUp");
    await delay(SCHEDULE_SETTLE_MS);
    const result = await requireEvaluation(target, SCHEDULE_VALUE_EXPRESSION);
    if (result.value !== value) {
      throw new Error("官方定时时间未能确认");
    }
  } finally {
    await chrome.debugger.detach(target).catch(() => undefined);
  }
}

interface ControlPoint {
  x: number;
  y: number;
}

async function locateControl(
  target: chrome.debugger.Debuggee,
): Promise<ControlPoint> {
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
          x?: number;
          y?: number;
        };
      };
    }
  )?.result?.value;
  if (value?.ok !== true) {
    throw new Error(value?.message || "无法定位创作平台发布按钮");
  }
  if (!Number.isFinite(value.x) || !Number.isFinite(value.y)) {
    throw new Error("创作平台发布按钮没有可用坐标");
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

async function activateDomFallback(
  target: chrome.debugger.Debuggee,
): Promise<void> {
  const response = await chrome.debugger.sendCommand(
    target,
    "Runtime.evaluate",
    {
      expression: FALLBACK_EXPRESSION,
      returnByValue: true,
      userGesture: true,
    },
  );
  const value = (
    response as {
      result?: {
        value?: {
          path?: string;
          result?: { message?: string; ok?: boolean };
        };
      };
    }
  )?.result?.value;
  if (value?.path && !value.path.startsWith("/publish/publish")) return;
  if (value?.result?.ok === true) return;
  throw new Error(value?.result?.message || "无法提交创作平台发布按钮");
}

async function requireEvaluation(
  target: chrome.debugger.Debuggee,
  expression: string,
): Promise<{ ok?: boolean; message?: string; value?: string }> {
  const response = await chrome.debugger.sendCommand(
    target,
    "Runtime.evaluate",
    { expression, returnByValue: true },
  );
  const value = (
    response as {
      result?: {
        value?: { ok?: boolean; message?: string; value?: string };
      };
    }
  )?.result?.value;
  if (value?.ok !== true) {
    throw new Error(value?.message || "创作平台输入控件不可用");
  }
  return value;
}

async function dispatchTab(
  target: chrome.debugger.Debuggee,
  type: "keyDown" | "keyUp",
): Promise<void> {
  await chrome.debugger.sendCommand(target, "Input.dispatchKeyEvent", {
    type,
    key: "Tab",
    code: "Tab",
    windowsVirtualKeyCode: 9,
    nativeVirtualKeyCode: 9,
  });
}

function validateCreatorPage(senderUrl?: string): void {
  const url = senderUrl ? new URL(senderUrl) : undefined;
  if (url?.origin !== CREATOR_ORIGIN || !url.pathname.startsWith("/publish/")) {
    throw new Error("只能在小红书创作发布页执行发布");
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
