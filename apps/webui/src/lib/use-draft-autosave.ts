import { useEffect, useRef, useState } from "react";

import type { PublicationDraftInput } from "./publication";

/** 自动保存的当前状态，用于在界面上说明"存没存上"。 */
export type AutosaveState = "idle" | "pending" | "saved" | "failed";

/** 停止输入多久后落盘。太短会把每个字都变成一次请求，太长则失去意义。 */
const IDLE_DELAY = 1200;

/**
 * 草稿自动保存。
 *
 * 写到一半切走或关掉页面就丢内容，是创作类界面最不可接受的一种损失。
 * 这里在停止输入后延时落盘，并把状态交还给界面明确告知。
 *
 * @param input 当前编辑中的草稿内容。
 * @param save 实际执行保存的回调。
 * @param enabled 为假时完全不启用，例如正在手动提交发布。
 * @returns 自动保存状态。
 */
export function useDraftAutosave(
  input: PublicationDraftInput,
  save: (input: PublicationDraftInput) => Promise<unknown>,
  enabled = true,
): AutosaveState {
  const [state, setState] = useState<AutosaveState>("idle");
  const saveRef = useRef(save);
  // 已落盘内容的指纹；相同内容不重复写，避免切换草稿时白存一次。
  const savedFingerprint = useRef<string | null>(null);

  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  const fingerprint = JSON.stringify(input);

  useEffect(() => {
    if (!enabled) return;
    if (savedFingerprint.current === null) {
      // 首次挂载只记录基线，不把"打开草稿"本身当成一次编辑。
      savedFingerprint.current = fingerprint;
      return;
    }
    if (savedFingerprint.current === fingerprint) return;

    setState("pending");
    let active = true;
    const timer = window.setTimeout(() => {
      void saveRef
        .current(JSON.parse(fingerprint) as PublicationDraftInput)
        .then(() => {
          if (!active) return;
          savedFingerprint.current = fingerprint;
          setState("saved");
        })
        .catch(() => {
          if (active) setState("failed");
        });
    }, IDLE_DELAY);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [enabled, fingerprint]);

  return state;
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
