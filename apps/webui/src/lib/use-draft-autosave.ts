import { useCallback, useEffect, useRef, useState } from "react";

import type { PublicationDraftInput } from "./publication";

/** 自动保存的当前状态，用于在界面上说明"存没存上"。 */
export type AutosaveState = "idle" | "pending" | "saved" | "failed";

/** 保存草稿的回调；关页面时会带 keepalive 再发一次。 */
export type DraftSave = (
  input: PublicationDraftInput,
  options?: { keepalive?: boolean },
) => Promise<unknown>;

/** 自动保存的状态与立即落盘入口。 */
export interface DraftAutosave {
  state: AutosaveState;
  /** 立刻把等待中的内容写出去；没有待写内容时什么都不做。 */
  flush: () => void;
}

/** 停止输入多久后落盘。太短会把每个字都变成一次请求，太长则失去意义。 */
const IDLE_DELAY = 1200;

/**
 * 草稿自动保存。
 *
 * 写到一半切走或关掉页面就丢内容，是创作类界面最不可接受的一种损失。
 * 这里在停止输入后延时落盘，并把状态交还给界面明确告知。
 *
 * 防抖期内卸载（切换草稿、关闭页面）会把等待中的内容补写出去，否则那段
 * 输入随定时器一起消失，而界面最后一句话还停在“正在保存草稿…”。
 *
 * @param input 当前编辑中的草稿内容。
 * @param save 实际执行保存的回调。
 * @param enabled 为假时完全不启用，例如正在手动提交发布。
 * @returns 自动保存状态与立即落盘入口。
 */
export function useDraftAutosave(
  input: PublicationDraftInput,
  save: DraftSave,
  enabled = true,
): DraftAutosave {
  const [state, setState] = useState<AutosaveState>("idle");
  const saveRef = useRef(save);
  // 已落盘内容的指纹；相同内容不重复写，避免切换草稿时白存一次。
  const savedFingerprint = useRef<string | null>(null);
  // 已进入防抖等待但还没写出去的内容；卸载与失焦时据此补写。
  const pendingFingerprint = useRef<string | null>(null);
  // 正在写的内容；补写时据此避开对同一份内容的重复请求。
  const inFlightFingerprint = useRef<string | null>(null);
  // 排定中的防抖定时器；补写要连它一起取消，否则同一份内容会被写两次。
  const timer = useRef(0);

  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  const fingerprint = JSON.stringify(input);

  const flush = useCallback((options?: { keepalive?: boolean }) => {
    window.clearTimeout(timer.current);
    timer.current = 0;
    const pending = pendingFingerprint.current;
    if (pending === null) return;
    if (pending === savedFingerprint.current || pending === inFlightFingerprint.current) return;
    pendingFingerprint.current = null;
    savedFingerprint.current = pending;
    // 补写不改状态：此时组件通常已经卸载，也没有界面还在等这个结果。
    void saveRef.current(JSON.parse(pending) as PublicationDraftInput, options).catch(() => {});
  }, []);

  useEffect(() => {
    if (!enabled) return;
    if (savedFingerprint.current === null) {
      // 首次挂载只记录基线，不把"打开草稿"本身当成一次编辑。
      savedFingerprint.current = fingerprint;
      return;
    }
    if (savedFingerprint.current === fingerprint) return;

    pendingFingerprint.current = fingerprint;
    setState("pending");
    let active = true;
    timer.current = window.setTimeout(() => {
      inFlightFingerprint.current = fingerprint;
      void saveRef
        .current(JSON.parse(fingerprint) as PublicationDraftInput)
        .then(() => {
          savedFingerprint.current = fingerprint;
          if (active) setState("saved");
        })
        .catch(() => {
          if (active) setState("failed");
        })
        .finally(() => {
          if (pendingFingerprint.current === fingerprint) pendingFingerprint.current = null;
          if (inFlightFingerprint.current === fingerprint) inFlightFingerprint.current = null;
        });
    }, IDLE_DELAY);

    return () => {
      active = false;
      window.clearTimeout(timer.current);
    };
  }, [enabled, fingerprint]);

  /*
   * 卸载补写单独成一个空依赖的 effect。
   *
   * 上面那个 effect 的依赖里有 fingerprint，它的清理每敲一个键就要跑一次；
   * 把补写写进那里等于把防抖退化成“每次按键一个请求”。
   */
  useEffect(() => () => flush(), [flush]);

  // 关闭或隐藏页面时补写。keepalive 让请求在文档销毁后仍能发完。
  useEffect(() => {
    const saveBeforeUnload = () => flush({ keepalive: true });
    window.addEventListener("pagehide", saveBeforeUnload);
    return () => window.removeEventListener("pagehide", saveBeforeUnload);
  }, [flush]);

  return { state, flush };
}

/**
 * 自动保存状态对应的提示文案。
 *
 * @param state 当前自动保存状态。
 * @returns 展示文案；无需展示时为空串。
 */
export function autosaveLabel(state: AutosaveState): string {
  if (state === "pending") return "正在保存草稿…";
  if (state === "saved") return "草稿已自动保存";
  if (state === "failed") return "草稿没能自动保存，请手动保存一次";
  return "";
}
