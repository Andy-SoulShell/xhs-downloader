const REQUEST_EVENT = "xhd-browser-state-request";
const RESPONSE_EVENT = "xhd-browser-state-response";

interface BridgeResponse {
  requestId: string;
  ok: boolean;
  data?: string;
  message?: string;
}

/** 从主世界读取当前响应式页面状态，避免使用导航时的陈旧脚本快照。 */
export function readLiveInitialState(
  page: Document,
  timeoutMilliseconds = 1_000,
): Promise<Record<string, unknown>> {
  const scope = page.defaultView;
  if (!scope) return Promise.reject(new Error("当前页面没有可用窗口"));
  const requestId = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const timeout = scope.setTimeout(() => {
      scope.removeEventListener(RESPONSE_EVENT, onResponse);
      reject(new Error("读取小红书实时状态超时"));
    }, timeoutMilliseconds);
    const onResponse = (event: Event) => {
      const response = parseResponse((event as CustomEvent).detail);
      if (!response || response.requestId !== requestId) return;
      scope.clearTimeout(timeout);
      scope.removeEventListener(RESPONSE_EVENT, onResponse);
      if (!response.ok || !response.data) {
        reject(new Error(response.message || "小红书实时状态不可用"));
        return;
      }
      try {
        resolve(JSON.parse(response.data) as Record<string, unknown>);
      } catch {
        reject(new Error("小红书实时状态格式无效"));
      }
    };
    scope.addEventListener(RESPONSE_EVENT, onResponse);
    scope.dispatchEvent(
      new CustomEvent(REQUEST_EVENT, {
        detail: JSON.stringify({ requestId }),
      }),
    );
  });
}

/** 返回主世界桥接使用的固定事件名。 */
export function browserStateEvents(): {
  request: string;
  response: string;
} {
  return { request: REQUEST_EVENT, response: RESPONSE_EVENT };
}

function parseResponse(value: unknown): BridgeResponse | null {
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value) as BridgeResponse;
    return typeof parsed.requestId === "string" ? parsed : null;
  } catch {
    return null;
  }
}
