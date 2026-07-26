import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  listBrowserExtensions,
  listBrowserTasks,
  retryBrowserTask,
  reviewBrowserTask,
  revokeBrowserExtension,
} from "./browser-management-api";
import { useBrowserMonitor } from "./use-browser-monitor";
import { makeCompletedBrowserTask } from "../test/browser-explorer-fixtures";

vi.mock("./browser-management-api", () => ({
  listBrowserExtensions: vi.fn(),
  listBrowserTasks: vi.fn(),
  retryBrowserTask: vi.fn(),
  reviewBrowserTask: vi.fn(),
  revokeBrowserExtension: vi.fn(),
}));

const extension = {
  extension_id: "synthetic-extension",
  registered_at: "2026-01-01T00:00:00Z",
  last_seen_at: "2026-01-01T00:00:01Z",
  online: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listBrowserExtensions).mockResolvedValue([extension]);
  vi.mocked(listBrowserTasks).mockResolvedValue([makeCompletedBrowserTask({})]);
});

afterEach(() => vi.useRealTimers());

describe("浏览器状态与操作", () => {
  it("首次读取汇总在线实例与最近操作", async () => {
    const { result } = renderHook(() => useBrowserMonitor());

    await waitFor(() => expect(result.current.tasks).toHaveLength(1));
    expect(result.current.onlineCount).toBe(1);
    expect(result.current.error).toBe("");
  });

  it("读取失败时给出错误且不清空已有数据", async () => {
    const { result } = renderHook(() => useBrowserMonitor());
    await waitFor(() => expect(result.current.tasks).toHaveLength(1));
    vi.mocked(listBrowserTasks).mockRejectedValue(new Error("本地服务无响应"));

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.error).toBe("本地服务无响应");
    expect(result.current.tasks).toHaveLength(1);
  });

  it("重试后就地更新该条记录", async () => {
    const retried = { ...makeCompletedBrowserTask({}), status: "queued" as const };
    vi.mocked(retryBrowserTask).mockResolvedValue(retried);
    const { result } = renderHook(() => useBrowserMonitor());
    await waitFor(() => expect(result.current.tasks).toHaveLength(1));

    await act(async () => {
      await result.current.retry(retried.task_id);
    });

    expect(result.current.tasks[0].status).toBe("queued");
    expect(result.current.retryingTaskId).toBeNull();
  });

  it("重试失败时报告原因并结束忙碌态", async () => {
    vi.mocked(retryBrowserTask).mockRejectedValue(new Error("任务不可重试"));
    const { result } = renderHook(() => useBrowserMonitor());
    await waitFor(() => expect(result.current.tasks).toHaveLength(1));

    await act(async () => {
      await result.current.retry("synthetic-task");
    });

    expect(result.current.error).toBe("任务不可重试");
    expect(result.current.retryingTaskId).toBeNull();
  });

  it("人工核对结论写回该条记录", async () => {
    const reviewed = {
      ...makeCompletedBrowserTask({}),
      status: "succeeded" as const,
      message: "已确认生效",
    };
    vi.mocked(reviewBrowserTask).mockResolvedValue(reviewed);
    const { result } = renderHook(() => useBrowserMonitor());
    await waitFor(() => expect(result.current.tasks).toHaveLength(1));

    await act(async () => {
      await result.current.review(reviewed.task_id, true);
    });

    expect(reviewBrowserTask).toHaveBeenCalledWith(reviewed.task_id, true);
    expect(result.current.tasks[0].message).toBe("已确认生效");
    expect(result.current.reviewingTaskId).toBeNull();
  });

  it("核对失败时保留原记录并给出原因", async () => {
    vi.mocked(reviewBrowserTask).mockRejectedValue(new Error("任务状态已变化"));
    const { result } = renderHook(() => useBrowserMonitor());
    await waitFor(() => expect(result.current.tasks).toHaveLength(1));

    await act(async () => {
      await result.current.review("synthetic-task", false);
    });

    expect(result.current.error).toBe("任务状态已变化");
    expect(result.current.reviewingTaskId).toBeNull();
  });

  it("注销扩展登记后重新读取在线状态", async () => {
    vi.mocked(revokeBrowserExtension).mockResolvedValue(undefined);
    const { result } = renderHook(() => useBrowserMonitor());
    await waitFor(() => expect(result.current.extensions).toHaveLength(1));
    vi.mocked(listBrowserExtensions).mockResolvedValue([]);

    await act(async () => {
      await result.current.revoke(extension.extension_id);
    });

    expect(revokeBrowserExtension).toHaveBeenCalledWith(
      extension.extension_id,
    );
    await waitFor(() => expect(result.current.onlineCount).toBe(0));
  });

  it("注销失败时给出原因", async () => {
    vi.mocked(revokeBrowserExtension).mockRejectedValue(
      new Error("扩展登记不存在"),
    );
    const { result } = renderHook(() => useBrowserMonitor());
    await waitFor(() => expect(result.current.extensions).toHaveLength(1));

    await act(async () => {
      await result.current.revoke("missing");
    });

    expect(result.current.error).toBe("扩展登记不存在");
    expect(result.current.revokingExtensionId).toBeNull();
  });
});
