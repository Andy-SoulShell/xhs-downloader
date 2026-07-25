import { browserStateEvents } from "./browser-state-bridge";

type StateScope = Window & { __INITIAL_STATE__?: unknown };

/** 在页面主世界安装只读状态桥接。 */
export function installBrowserStateBridge(
  scope: StateScope = window,
): () => void {
  const events = browserStateEvents();
  const onRequest = (event: Event) => {
    const requestId = requestIdFromDetail((event as CustomEvent).detail);
    if (!requestId) return;
    try {
      const data = JSON.stringify(scope.__INITIAL_STATE__);
      if (!data) throw new Error("小红书实时状态尚未加载");
      respond(scope, events.response, { requestId, ok: true, data });
    } catch (error) {
      respond(scope, events.response, {
        requestId,
        ok: false,
        message: error instanceof Error ? error.message : "实时状态读取失败",
      });
    }
  };
  scope.addEventListener(events.request, onRequest);
  return () => scope.removeEventListener(events.request, onRequest);
}

function requestIdFromDetail(value: unknown): string {
  if (typeof value !== "string") return "";
  try {
    const parsed = JSON.parse(value) as { requestId?: unknown };
    return typeof parsed.requestId === "string" ? parsed.requestId : "";
  } catch {
    return "";
  }
}

function respond(
  scope: Window,
  eventName: string,
  value: Record<string, unknown>,
): void {
  scope.dispatchEvent(
    new CustomEvent(eventName, { detail: JSON.stringify(value) }),
  );
}
