import type { DesiredStateResult } from "@xhs-downloader/contracts";

import { UncertainBrowserActionError } from "./browser-action-errors";
import { readLiveInitialState } from "./browser-state-bridge";
import { dataRecord, dataText } from "./page-data";

type InteractionKind = "like" | "favorite";

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
  const before = interactionState(
    await readLiveInitialState(page),
    feedId,
    kind,
  );
  if (before === active) {
    return { feed_id: feedId, active, changed: false, verified: true };
  }
  const control = await waitForInteractionControl(page, kind);
  if (!control) {
    throw new Error(kind === "like" ? "页面没有点赞按钮" : "页面没有收藏按钮");
  }
  if (activate) await activate();
  else clickInteractionControl(page, control);
  for (let attempt = 0; attempt < 16; attempt += 1) {
    try {
      const current = interactionState(
        await readLiveInitialState(page),
        feedId,
        kind,
      );
      if (current === active) {
        return { feed_id: feedId, active, changed: true, verified: true };
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

function clickInteractionControl(page: Document, control: Element): void {
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
  return info[field];
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
