import type {
  BrowserTask,
  JsonValue,
} from "@xhs-downloader/contracts";

import { UncertainBrowserActionError } from "./browser-action-errors";
import { buildPageCompatibilityDiagnostics } from "./browser-page-diagnostics";
import {
  executeBrowserPageTask,
  type BrowserPageTaskResponse,
} from "./browser-page-runner";
import { installBrowserStateBridge } from "./browser-state-main";

/** 受管浏览器在页面主世界读取的稳定全局对象名。 */
export const MANAGED_PAGE_ADAPTER_GLOBAL =
  "__XHS_DOWNLOADER_MANAGED_PAGE_ADAPTER__";

/** 受管浏览器页面适配器协议版本。 */
export const MANAGED_PAGE_ADAPTER_VERSION = "1";

/** 受管浏览器通过 CDP 调用的页面能力入口。 */
export interface ManagedPageAdapter {
  version: string;
  execute(task: BrowserTask): Promise<BrowserPageTaskResponse>;
  diagnostics(): Record<string, JsonValue>;
}

type AdapterScope = Window & {
  __XHS_DOWNLOADER_MANAGED_PAGE_ADAPTER__?: ManagedPageAdapter;
};

/** 安装实时状态桥和受管浏览器页面入口；重复注入时复用当前版本。 */
export function installManagedPageAdapter(
  scope: AdapterScope = window as AdapterScope,
): ManagedPageAdapter {
  const current = scope.__XHS_DOWNLOADER_MANAGED_PAGE_ADAPTER__;
  if (current?.version === MANAGED_PAGE_ADAPTER_VERSION) return current;

  installBrowserStateBridge(scope);
  const adapter: ManagedPageAdapter = {
    version: MANAGED_PAGE_ADAPTER_VERSION,
    execute: (task) => executeSafely(task, scope),
    diagnostics: () =>
      buildPageCompatibilityDiagnostics(scope.document, scope.location.href),
  };
  Object.defineProperty(scope, MANAGED_PAGE_ADAPTER_GLOBAL, {
    configurable: true,
    enumerable: false,
    value: adapter,
    writable: false,
  });
  return adapter;
}

async function executeSafely(
  task: BrowserTask,
  scope: AdapterScope,
): Promise<BrowserPageTaskResponse> {
  try {
    return await executeBrowserPageTask(
      task,
      scope.document,
      scope.location.href,
    );
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "页面数据解析失败",
      status:
        error instanceof UncertainBrowserActionError
          ? "needs_review"
          : "failed",
      result: buildPageCompatibilityDiagnostics(
        scope.document,
        scope.location.href,
      ),
    };
  }
}

installManagedPageAdapter();
