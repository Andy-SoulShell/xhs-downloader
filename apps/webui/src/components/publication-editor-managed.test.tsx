import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PublicationDraftInput } from "../lib/publication";
import { makePublicationDraft, makePublicationTask } from "../test/fixtures";
import { PublicationEditor } from "./publication-editor";

type EditorProps = Parameters<typeof PublicationEditor>[0];

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderEditor(overrides: Partial<EditorProps> = {}) {
  const properties = {
    browserDriver: "managed" as const,
    draft: makePublicationDraft({
      visibility: "public",
      products: ["合成商品"],
    }),
    onDelete: vi.fn().mockResolvedValue(undefined),
    onNotify: vi.fn(),
    onRemoveAsset: vi.fn().mockResolvedValue(undefined),
    onSave: vi.fn().mockImplementation(async (input: PublicationDraftInput) => ({
      ...makePublicationDraft(),
      ...input,
    })),
    onSubmitManual: vi.fn().mockResolvedValue(makePublicationTask({ target_driver: "managed" })),
    onSubmitPlatformScheduled: vi.fn().mockResolvedValue(
      makePublicationTask({
        mode: "platform_scheduled",
        target_driver: "managed",
      }),
    ),
    onSubmitScheduled: vi.fn().mockResolvedValue(
      makePublicationTask({
        mode: "scheduled",
        status: "scheduled",
        target_driver: "managed",
      }),
    ),
    onUpload: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  render(<PublicationEditor {...properties} />);
  return properties;
}

function localDateTime(instant: Date): string {
  return new Date(instant.getTime() - instant.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

describe("受管浏览器发布编辑器", () => {
  it("本地定时冻结私密无商品任务且不打开日常浏览器", async () => {
    const open = vi.spyOn(window, "open");
    const properties = renderEditor();
    fireEvent.change(screen.getByLabelText("计划发布时间"), {
      target: { value: "2099-01-02T03:04" },
    });
    fireEvent.click(screen.getByRole("button", { name: "本地定时" }));
    fireEvent.click(screen.getByRole("button", { name: "确认本地定时" }));

    await waitFor(() => expect(properties.onSubmitScheduled).toHaveBeenCalled());
    expect(properties.onSave).toHaveBeenCalledWith(
      expect.objectContaining({ visibility: "private", products: [] }),
    );
    expect(properties.onNotify).toHaveBeenCalledWith("本地定时任务已保存，届时由受管浏览器执行");
    expect(open).not.toHaveBeenCalled();
  });

  it("官方定时交给受管浏览器且不打开扩展创作页", async () => {
    const open = vi.spyOn(window, "open");
    const properties = renderEditor();
    const scheduled = new Date(Date.now() + 2 * 60 * 60_000);
    fireEvent.change(screen.getByLabelText("计划发布时间"), {
      target: { value: localDateTime(scheduled) },
    });
    fireEvent.click(screen.getByRole("button", { name: "官方定时" }));
    fireEvent.click(screen.getByRole("button", { name: "确认官方定时" }));

    await waitFor(() => expect(properties.onSubmitPlatformScheduled).toHaveBeenCalled());
    expect(properties.onSave).toHaveBeenCalledWith(
      expect.objectContaining({ visibility: "private", products: [] }),
    );
    expect(properties.onNotify).toHaveBeenCalledWith("官方定时任务已交给受管浏览器设置");
    expect(open).not.toHaveBeenCalled();
  });

  it("素材重排不会提前覆盖草稿的公开范围和商品", async () => {
    const first = makePublicationDraft().assets[0];
    const properties = renderEditor({
      draft: makePublicationDraft({
        visibility: "public",
        products: ["合成商品"],
        assets: [
          first,
          {
            ...first,
            asset_id: "synthetic-second-asset",
            filename: "synthetic-second.jpeg",
            position: 1,
          },
        ],
      }),
    });

    fireEvent.click(screen.getByRole("button", { name: "下移 synthetic.jpeg" }));

    await waitFor(() => expect(properties.onSave).toHaveBeenCalled());
    expect(properties.onSave).toHaveBeenCalledWith({
      title: "合成发布标题",
      body: "合成发布正文",
      tags: ["合成", "测试"],
      visibility: "public",
      is_original: false,
      products: ["合成商品"],
      asset_order: ["synthetic-second-asset", "synthetic-asset"],
    });
  });

  it("以后端冻结驱动为准并关闭误开的扩展弹窗", async () => {
    const popup = {
      close: vi.fn(),
      location: { href: "" },
      opener: window,
    };
    vi.spyOn(window, "open").mockReturnValue(popup as unknown as Window);
    const properties = renderEditor({
      browserDriver: "extension",
      onSubmitManual: vi.fn().mockResolvedValue(makePublicationTask({ target_driver: "managed" })),
    });

    fireEvent.click(screen.getByRole("button", { name: "立即发布" }));
    fireEvent.click(screen.getByRole("button", { name: "确认立即发布" }));

    await waitFor(() => expect(popup.close).toHaveBeenCalled());
    expect(popup.location.href).toBe("");
    expect(properties.onNotify).toHaveBeenCalledWith("发布任务已交给受管浏览器");
  });

  it("未知冻结驱动关闭弹窗并停止后续导航", async () => {
    const popup = {
      close: vi.fn(),
      location: { href: "" },
      opener: window,
    };
    vi.spyOn(window, "open").mockReturnValue(popup as unknown as Window);
    const invalidTask = {
      ...makePublicationTask(),
      target_driver: "future-browser-driver",
    };
    const properties = renderEditor({
      browserDriver: "extension",
      onSubmitManual: vi.fn().mockResolvedValue(invalidTask as never),
    });

    fireEvent.click(screen.getByRole("button", { name: "立即发布" }));
    fireEvent.click(screen.getByRole("button", { name: "确认立即发布" }));

    await waitFor(() =>
      expect(properties.onNotify).toHaveBeenCalledWith("发布任务返回了不支持的浏览器执行器"),
    );
    expect(popup.close).toHaveBeenCalled();
    expect(popup.location.href).toBe("");
  });
});
