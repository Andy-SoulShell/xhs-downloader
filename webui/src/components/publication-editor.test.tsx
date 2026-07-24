import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  makePublicationDraft,
  makePublicationTask,
} from "../test/fixtures";
import { PublicationEditor } from "./publication-editor";

afterEach(() => vi.restoreAllMocks());

function renderEditor(
  overrides: Partial<Parameters<typeof PublicationEditor>[0]> = {},
) {
  const properties = {
    draft: makePublicationDraft(),
    onDelete: vi.fn().mockResolvedValue(undefined),
    onNotify: vi.fn(),
    onRemoveAsset: vi.fn().mockResolvedValue(undefined),
    onSave: vi.fn().mockImplementation(async (input) => ({
      ...makePublicationDraft(),
      ...input,
    })),
    onSubmitManual: vi.fn().mockResolvedValue(makePublicationTask()),
    onSubmitScheduled: vi.fn().mockResolvedValue(
      makePublicationTask({ mode: "scheduled", status: "scheduled" }),
    ),
    onUpload: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  render(<PublicationEditor {...properties} />);
  return properties;
}

describe("发布草稿编辑器", () => {
  it("保存规范化内容并一键打开指定发布任务", async () => {
    const popup = {
      close: vi.fn(),
      location: { href: "" },
      opener: window,
    };
    vi.spyOn(window, "open").mockReturnValue(popup as unknown as Window);
    const properties = renderEditor();
    fireEvent.change(screen.getByLabelText("标题"), {
      target: { value: "  新标题  " },
    });
    fireEvent.change(screen.getByLabelText("话题标签"), {
      target: { value: "#标签 标签，第二个" },
    });
    fireEvent.click(screen.getByRole("button", { name: /一键发布/ }));

    await waitFor(() => expect(properties.onSubmitManual).toHaveBeenCalled());
    expect(properties.onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "新标题",
        tags: ["标签", "第二个"],
      }),
    );
    expect(popup.opener).toBeNull();
    expect(popup.location.href).toContain(
      "xhd_task=synthetic-publication-task",
    );
    expect(properties.onNotify).toHaveBeenCalledWith(
      "发布任务已交给浏览器扩展",
    );
  });

  it("校验空内容、缺失素材和被阻止的弹窗", async () => {
    const noContent = makePublicationDraft({ title: "", body: "" });
    const properties = renderEditor({ draft: noContent });
    fireEvent.click(screen.getByRole("button", { name: /一键发布/ }));
    await waitFor(() =>
      expect(properties.onNotify).toHaveBeenCalledWith(
        "标题和正文不能同时为空",
      ),
    );
    cleanup();

    const empty = makePublicationDraft({ assets: [] });
    const emptyProperties = renderEditor({ draft: empty });
    fireEvent.click(screen.getByRole("button", { name: /一键发布/ }));
    await waitFor(() =>
      expect(emptyProperties.onNotify).toHaveBeenCalledWith(
        "请至少添加一个发布素材",
      ),
    );
    cleanup();

    vi.spyOn(window, "open").mockReturnValue(null);
    const blocked = renderEditor();
    fireEvent.click(screen.getByRole("button", { name: /一键发布/ }));
    await waitFor(() =>
      expect(blocked.onNotify).toHaveBeenCalledWith(
        "任务已就绪，但浏览器阻止了创作页弹窗",
      ),
    );
  });

  it("保存未来排期并拒绝无效时间", async () => {
    const properties = renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "定时发布" }));
    await waitFor(() =>
      expect(properties.onNotify).toHaveBeenCalledWith(
        "请选择有效的计划发布时间",
      ),
    );
    fireEvent.change(screen.getByLabelText("计划发布时间"), {
      target: { value: "2020-01-02T03:04" },
    });
    fireEvent.click(screen.getByRole("button", { name: "定时发布" }));
    await waitFor(() =>
      expect(properties.onNotify).toHaveBeenCalledWith(
        "计划发布时间必须晚于当前时间",
      ),
    );
    fireEvent.change(screen.getByLabelText("计划发布时间"), {
      target: { value: "2099-01-02T03:04" },
    });
    fireEvent.click(screen.getByRole("button", { name: "定时发布" }));

    await waitFor(() =>
      expect(properties.onSubmitScheduled).toHaveBeenCalledWith(
        new Date("2099-01-02T03:04").toISOString(),
      ),
    );
    expect(properties.onNotify).toHaveBeenCalledWith(
      "定时发布任务已保存，届时由浏览器扩展执行",
    );
  });

  it("上传、排序、删除素材和草稿", async () => {
    const properties = renderEditor();
    const file = new File(["value"], "second.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("添加素材"), {
      target: { files: [file] },
    });
    await waitFor(() =>
      expect(properties.onUpload).toHaveBeenCalledWith([file]),
    );

    fireEvent.click(screen.getByRole("button", { name: /删除 synthetic/ }));
    await waitFor(() =>
      expect(properties.onRemoveAsset).toHaveBeenCalledWith(
        "synthetic-asset",
      ),
    );
    vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "删除草稿" }));
    await waitFor(() => expect(properties.onDelete).toHaveBeenCalled());
  });
});
