import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PublicationDraftInput } from "./publication";
import { autosaveLabel, useDraftAutosave } from "./use-draft-autosave";

function makeInput(title: string): PublicationDraftInput {
  return {
    title,
    body: "合成正文",
    tags: [],
    visibility: "public",
    is_original: true,
    products: [],
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("草稿自动保存", () => {
  it("打开草稿本身不算一次编辑", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    renderHook(() => useDraftAutosave(makeInput("初始"), save));

    await act(async () => {
      vi.advanceTimersByTime(3000);
    });

    expect(save).not.toHaveBeenCalled();
  });

  it("停止输入后落盘并报告状态", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { rerender, result } = renderHook(
      ({ title }: { title: string }) =>
        useDraftAutosave(makeInput(title), save),
      { initialProps: { title: "初始" } },
    );

    rerender({ title: "改过的标题" });
    expect(result.current).toBe("pending");
    expect(save).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1200);
    });

    expect(save).toHaveBeenCalledOnce();
    expect(save.mock.calls[0][0].title).toBe("改过的标题");
    expect(result.current).toBe("saved");
  });

  it("连续输入只在停下来之后写一次", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { rerender } = renderHook(
      ({ title }: { title: string }) =>
        useDraftAutosave(makeInput(title), save),
      { initialProps: { title: "初始" } },
    );

    for (const title of ["一", "一二", "一二三"]) {
      rerender({ title });
      await act(async () => {
        vi.advanceTimersByTime(300);
      });
    }
    await act(async () => {
      vi.advanceTimersByTime(1200);
    });

    // 每敲一个字就发一次请求会把服务打穿。
    expect(save).toHaveBeenCalledOnce();
    expect(save.mock.calls[0][0].title).toBe("一二三");
  });

  it("保存失败要说出来，而不是假装存上了", async () => {
    const save = vi.fn().mockRejectedValue(new Error("写入失败"));
    const { rerender, result } = renderHook(
      ({ title }: { title: string }) =>
        useDraftAutosave(makeInput(title), save),
      { initialProps: { title: "初始" } },
    );

    rerender({ title: "改过的标题" });
    await act(async () => {
      vi.advanceTimersByTime(1200);
    });

    expect(result.current).toBe("failed");
    expect(autosaveLabel("failed")).toContain("手动保存");
  });

  it("停用时完全不写", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { rerender } = renderHook(
      ({ title }: { title: string }) =>
        useDraftAutosave(makeInput(title), save, false),
      { initialProps: { title: "初始" } },
    );

    rerender({ title: "改过的标题" });
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });

    // 手动提交期间并发写入会互相覆盖。
    expect(save).not.toHaveBeenCalled();
  });
});
