import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { makeSettingsResponse } from "../test/fixtures";
import { getSettings, updateSettings } from "./api";
import { useSettings } from "./use-settings";

vi.mock("./api", () => ({
  getSettings: vi.fn(),
  updateSettings: vi.fn(),
}));

describe("配置状态管理", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("读取配置并在保存后更新快照", async () => {
    const initial = makeSettingsResponse();
    const updated = makeSettingsResponse({ restart_required: true });
    vi.mocked(getSettings).mockResolvedValue(initial);
    vi.mocked(updateSettings).mockResolvedValue(updated);
    const { result } = renderHook(() => useSettings());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.settings).toEqual(initial);

    await act(async () => {
      await result.current.save(initial.values);
    });

    expect(updateSettings).toHaveBeenCalledWith(initial.values);
    expect(result.current.settings).toEqual(updated);
    expect(result.current.saving).toBe(false);
  });

  it("显示读取错误并允许重新加载", async () => {
    const settings = makeSettingsResponse();
    vi.mocked(getSettings)
      .mockRejectedValueOnce(new Error("配置读取中断"))
      .mockResolvedValueOnce(settings);
    const { result } = renderHook(() => useSettings());

    await waitFor(() =>
      expect(result.current.error).toBe("配置读取中断"),
    );
    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.settings).toEqual(settings);
    expect(result.current.error).toBe("");
  });

  it("已有配置刷新失败时清空执行器快照", async () => {
    const settings = makeSettingsResponse();
    vi.mocked(getSettings)
      .mockResolvedValueOnce(settings)
      .mockRejectedValueOnce(new Error("配置响应无效"));
    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.settings).toEqual(settings));

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.settings).toBeNull();
    expect(result.current.error).toBe("配置响应无效");
  });

  it("保存失败时保留可展示的错误状态", async () => {
    const settings = makeSettingsResponse();
    vi.mocked(getSettings).mockResolvedValue(settings);
    vi.mocked(updateSettings).mockRejectedValue("synthetic failure");
    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await expect(result.current.save(settings.values)).rejects.toBe(
        "synthetic failure",
      );
    });

    expect(result.current.error).toBe("配置保存失败");
    expect(result.current.settings).toBeNull();
    expect(result.current.saving).toBe(false);
  });
});
