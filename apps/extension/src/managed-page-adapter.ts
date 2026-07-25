import type {
  BrowserTask,
  JsonValue,
} from "@xhs-downloader/contracts";

import {
  proveBrowserAccount,
  type BrowserAccountChallenge,
  type BrowserAccountProof,
} from "./account-proof";
import { UncertainBrowserActionError } from "./browser-action-errors";
import { buildPageCompatibilityDiagnostics } from "./browser-page-diagnostics";
import {
  executeBrowserPageTask,
  type BrowserPageTaskResponse,
} from "./browser-page-runner";
import { installBrowserStateBridge } from "./browser-state-main";
import {
  prepareDesiredInteraction,
  verifyDesiredInteraction,
  type InteractionKind,
} from "./interaction-runner";

/** 受管浏览器在页面主世界读取的稳定全局对象名。 */
export const MANAGED_PAGE_ADAPTER_GLOBAL =
  "__XHS_DOWNLOADER_MANAGED_PAGE_ADAPTER__";

/** 受管浏览器页面适配器协议版本。 */
export const MANAGED_PAGE_ADAPTER_VERSION = "3";

/** 受管浏览器完成互动所需的同页可信输入。 */
export interface ManagedInteractionAction {
  task_id: string;
  feed_id: string;
  kind: InteractionKind;
  active: boolean;
  selector: string;
}

/** 互动预检响应，可直接成功或请求一次可信输入。 */
export interface ManagedInteractionPreparationResponse
  extends BrowserPageTaskResponse {
  action?: ManagedInteractionAction;
}

/** 受管浏览器通过 CDP 调用的页面能力入口。 */
export interface ManagedPageAdapter {
  version: string;
  proveAccount(challenge: BrowserAccountChallenge): Promise<BrowserAccountProof>;
  execute(task: BrowserTask): Promise<BrowserPageTaskResponse>;
  prepareInteraction(
    task: BrowserTask,
  ): Promise<ManagedInteractionPreparationResponse>;
  verifyInteraction(task: BrowserTask): Promise<BrowserPageTaskResponse>;
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
    proveAccount: (challenge) => proveBrowserAccount(scope.document, challenge),
    execute: (task) => executeSafely(task, scope),
    prepareInteraction: (task) => prepareInteractionSafely(task, scope),
    verifyInteraction: (task) => verifyInteractionSafely(task, scope),
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
  if (isInteractionTask(task)) {
    return failure(
      new Error("受管浏览器互动必须通过可信输入流程执行"),
      scope,
    );
  }
  try {
    return await executeBrowserPageTask(
      task,
      scope.document,
      scope.location.href,
    );
  } catch (error) {
    return failure(error, scope);
  }
}

async function prepareInteractionSafely(
  task: BrowserTask,
  scope: AdapterScope,
): Promise<ManagedInteractionPreparationResponse> {
  try {
    const input = interactionInput(task);
    const preparation = await prepareDesiredInteraction(
      scope.document,
      input.feedId,
      input.kind,
      input.active,
    );
    if (preparation.result) {
      return success("互动状态已经满足目标", preparation.result);
    }
    return {
      ok: false,
      message: "互动状态需要受管浏览器可信输入",
      action: {
        task_id: task.task_id,
        feed_id: input.feedId,
        kind: input.kind,
        active: input.active,
        selector: preparation.selector,
      },
    };
  } catch (error) {
    return failure(error, scope);
  }
}

async function verifyInteractionSafely(
  task: BrowserTask,
  scope: AdapterScope,
): Promise<BrowserPageTaskResponse> {
  try {
    const input = interactionInput(task);
    return success(
      "互动状态已通过页面实时数据确认",
      await verifyDesiredInteraction(
        scope.document,
        input.feedId,
        input.kind,
        input.active,
      ),
    );
  } catch (error) {
    return failure(error, scope);
  }
}

function interactionInput(task: BrowserTask): {
  feedId: string;
  kind: InteractionKind;
  active: boolean;
} {
  if (!isInteractionTask(task)) {
    throw new Error("当前任务不是受支持的互动类型");
  }
  const feedId = task.payload.feed_id;
  const active = task.payload.active;
  if (typeof feedId !== "string" || !feedId) {
    throw new Error("浏览器任务缺少参数 feed_id");
  }
  if (typeof active !== "boolean") {
    throw new Error("浏览器任务参数 active 无效");
  }
  return {
    feedId,
    kind: task.kind === "set_like" ? "like" : "favorite",
    active,
  };
}

function isInteractionTask(
  task: BrowserTask,
): task is BrowserTask & { kind: "set_like" | "set_favorite" } {
  return task.kind === "set_like" || task.kind === "set_favorite";
}

function success(
  message: string,
  result: object,
): BrowserPageTaskResponse {
  return {
    ok: true,
    message,
    result: result as Record<string, JsonValue>,
  };
}

function failure(
  error: unknown,
  scope: AdapterScope,
): BrowserPageTaskResponse {
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

installManagedPageAdapter();
