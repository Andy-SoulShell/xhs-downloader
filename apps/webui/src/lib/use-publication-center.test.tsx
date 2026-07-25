import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  cancelPublicationTask,
  createPublicationDraft,
  deletePublicationDraft,
  listPublicationDrafts,
  listPublicationTasks,
  removePublicationAsset,
  reviewPublicationTask,
  retryPublicationTask,
  submitPublicationTask,
  updatePublicationDraft,
  uploadPublicationAsset,
} from "./publication-api";
import { usePublicationCenter } from "./use-publication-center";
import {
  makePublicationDraft,
  makePublicationTask,
} from "../test/fixtures";

vi.mock("./publication-api", () => ({
  cancelPublicationTask: vi.fn(),
  createPublicationDraft: vi.fn(),
  deletePublicationDraft: vi.fn(),
  listPublicationDrafts: vi.fn(),
  listPublicationTasks: vi.fn(),
  removePublicationAsset: vi.fn(),
  reviewPublicationTask: vi.fn(),
  retryPublicationTask: vi.fn(),
  submitPublicationTask: vi.fn(),
  updatePublicationDraft: vi.fn(),
  uploadPublicationAsset: vi.fn(),
}));

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(listPublicationDrafts).mockResolvedValue([]);
  vi.mocked(listPublicationTasks).mockResolvedValue([]);
});

afterEach(() => vi.useRealTimers());

describe("发布中心状态管理", () => {
  it("统一更新草稿、素材和任务状态", async () => {
    const initial = makePublicationDraft();
    const created = makePublicationDraft({ draft_id: "created" });
    const saved = makePublicationDraft({ title: "已保存" });
    const withAsset = makePublicationDraft({
      assets: [
        ...initial.assets,
        {
          ...initial.assets[0],
          asset_id: "second",
          position: 1,
        },
      ],
    });
    const task = makePublicationTask();
    vi.mocked(listPublicationDrafts).mockResolvedValue([initial]);
    vi.mocked(createPublicationDraft).mockResolvedValue(created);
    vi.mocked(updatePublicationDraft).mockResolvedValue(saved);
    vi.mocked(uploadPublicationAsset).mockResolvedValue(withAsset);
    vi.mocked(removePublicationAsset).mockResolvedValue(initial);
    vi.mocked(deletePublicationDraft).mockResolvedValue();
    vi.mocked(submitPublicationTask).mockResolvedValue(task);
    vi.mocked(retryPublicationTask).mockResolvedValue({
      ...task,
      status: "ready",
    });
    vi.mocked(reviewPublicationTask).mockResolvedValue({
      ...task,
      status: "published",
    });
    vi.mocked(cancelPublicationTask).mockResolvedValue({
      ...task,
      status: "canceled",
    });
    const { result } = renderHook(() => usePublicationCenter());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.createDraft();
      await result.current.saveDraft(initial.draft_id, {
        title: "已保存",
        body: "正文",
        tags: [],
        visibility: "public",
        is_original: false,
        products: [],
      });
      await result.current.uploadAsset(
        initial.draft_id,
        new File(["value"], "asset.png"),
      );
      await result.current.removeAsset(initial.draft_id, "second");
      await result.current.submitTask(initial.draft_id, "manual");
      await result.current.retryTask(task.task_id);
      await result.current.reviewTask(task.task_id, true);
      await result.current.cancelTask(task.task_id);
      await result.current.deleteDraft(created.draft_id);
    });

    expect(result.current.drafts).toEqual([initial]);
    expect(result.current.tasks[0].status).toBe("canceled");
    expect(submitPublicationTask).toHaveBeenCalledWith(
      initial.draft_id,
      "manual",
      undefined,
    );
    expect(reviewPublicationTask).toHaveBeenCalledWith(task.task_id, true);
  });

  it("轮询活动任务并允许手动刷新", async () => {
    vi.useFakeTimers();
    const task = makePublicationTask({ status: "ready" });
    vi.mocked(listPublicationTasks).mockResolvedValue([task]);
    const { result } = renderHook(() => usePublicationCenter());
    await act(async () => {
      await vi.runAllTicks();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.loading).toBe(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    await act(async () => {
      await result.current.refreshTasks();
    });

    expect(listPublicationTasks).toHaveBeenCalledTimes(3);
  });

  it("区分读取异常和非标准任务错误", async () => {
    vi.mocked(listPublicationDrafts).mockRejectedValue(
      new Error("发布中心离线"),
    );
    const { result } = renderHook(() => usePublicationCenter());

    await waitFor(() => expect(result.current.error).toBe("发布中心离线"));
    vi.mocked(listPublicationTasks).mockRejectedValue("unknown");
    await act(async () => {
      await result.current.refreshTasks();
    });

    expect(result.current.error).toBe("发布任务读取失败");
  });
});
