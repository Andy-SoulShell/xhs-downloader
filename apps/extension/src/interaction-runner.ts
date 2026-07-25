import type { DesiredStateResult } from "@xhs-downloader/contracts";

import { UncertainBrowserActionError } from "./browser-action-errors";
import { readLiveInitialState } from "./browser-state-bridge";
import { dataRecord, dataText } from "./page-data";

/** 页面互动的稳定语义类型。 */
export type InteractionKind = "like" | "favorite";

/** 互动预检结果：已满足目标，或等待浏览器级可信输入。 */
export type DesiredInteractionPreparation =
  | { result: DesiredStateResult; selector: null }
  | { result: null; selector: string };

const SELECTORS: Record<InteractionKind, string> = {
  like: ".interact-container .left .like-lottie",
  favorite: ".interact-container .left .reds-icon.collect-icon",
};
const CONTROL_READY_ATTEMPTS = 20;
const CONTROL_READY_INTERVAL_MS = 250;

/** 将点赞或收藏调整到目标状态，并在页面实时状态中核验。 */
export async function setDesiredInteraction(
  page: Document,
  feedId: string,
  kind: InteractionKind,
  active: boolean,
  activate?: () => Promise<void>,
): Promise<DesiredStateResult> {
  const preparation = await prepareDesiredInteraction(
    page,
    feedId,
    kind,
    active,
  );
  if (preparation.result) return preparation.result;
  if (activate) await activate();
  else clickInteractionControl(page, preparation.selector);
  return verifyDesiredInteraction(page, feedId, kind, active);
}

/** 操作前读取目标状态并确认对应控件已经就绪。 */
export async function prepareDesiredInteraction(
  page: Document,
  feedId: string,
  kind: InteractionKind,
  active: boolean,
): Promise<DesiredInteractionPreparation> {
  const before = interactionState(
    await readLiveInitialState(page),
    feedId,
    kind,
  );
  if (before === active) {
    return {
      result: {
        feed_id: feedId,
        kind,
        active,
        changed: false,
        verified: true,
      },
      selector: null,
    };
  }
  const control = await waitForInteractionControl(page, kind);
  if (!control) {
    throw new Error(kind === "like" ? "页面没有点赞按钮" : "页面没有收藏按钮");
  }
  return { result: null, selector: SELECTORS[kind] };
}

/** 可信输入触发后轮询实时状态，并返回严格的目标状态核验结果。 */
export async function verifyDesiredInteraction(
  page: Document,
  feedId: string,
  kind: InteractionKind,
  active: boolean,
): Promise<DesiredStateResult> {
  for (let attempt = 0; attempt < 16; attempt += 1) {
    try {
      const current = interactionState(
        await readLiveInitialState(page),
        feedId,
        kind,
      );
      if (current === active) {
        return {
          feed_id: feedId,
          kind,
          active,
          changed: true,
          verified: true,
        };
      }
    } catch {
      // 点击后的瞬时页面切换可能暂时读不到状态，继续在有界窗口内核验。
    }
    await delay(250);
  }
  const action = kind === "like" ? "点赞" : "收藏";
  throw new UncertainBrowserActionError(
    `${action}操作已触发，但未能确认最终状态，请人工核对`,
  );
}

async function waitForInteractionControl(
  page: Document,
  kind: InteractionKind,
): Promise<Element | null> {
  for (let attempt = 0; attempt < CONTROL_READY_ATTEMPTS; attempt += 1) {
    const control = page.querySelector(SELECTORS[kind]);
    if (control) return control;
    await delay(CONTROL_READY_INTERVAL_MS);
  }
  return null;
}

function clickInteractionControl(page: Document, selector: string): void {
  const control = page.querySelector(selector);
  if (!control) throw new Error("互动按钮在执行前已经失效");
  const clickable = control as Element & { click?: () => void };
  if (typeof clickable.click === "function") {
    clickable.click();
    return;
  }
  const MouseEventConstructor = page.defaultView?.MouseEvent;
  if (!MouseEventConstructor) {
    throw new Error("当前页面无法触发互动按钮");
  }
  control.dispatchEvent(
    new MouseEventConstructor("click", {
      bubbles: true,
      cancelable: true,
      composed: true,
    }),
  );
}

function interactionState(
  state: Record<string, unknown>,
  feedId: string,
  kind: InteractionKind,
): boolean {
  const note = dataRecord(state.note);
  const detailMap = dataRecord(note.noteDetailMap);
  const direct = dataRecord(detailMap[feedId]);
  const wrapper =
    (Object.keys(direct).length ? direct : null) ??
    Object.values(detailMap)
      .map(dataRecord)
      .find((item) => dataText(dataRecord(item.note).noteId) === feedId);
  const interact = dataRecord(dataRecord(wrapper).note);
  const info = dataRecord(interact.interactInfo);
  const field = kind === "like" ? "liked" : "collected";
  if (typeof info[field] !== "boolean") {
    throw new Error("页面没有可核验的互动状态");
  }
  if (dataText(interact.noteId) !== feedId) {
    throw new Error("页面互动状态不属于目标帖子");
  }
  return info[field];
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
