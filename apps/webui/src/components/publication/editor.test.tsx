import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { makePublicationDraft } from "../../test/fixtures";
import { PublicationEditor } from "./editor";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderEditor(overrides: Partial<Parameters<typeof PublicationEditor>[0]> = {}) {
  const properties = {
    browserDriver: "extension" as const,
    draft: makePublicationDraft(),
    onDelete: vi.fn().mockResolvedValue(undefined),
    onNotify: vi.fn(),
    onRemoveAsset: vi.fn().mockResolvedValue(undefined),
    onSave: vi.fn().mockImplementation(async (input) => ({
      ...makePublicationDraft(),
      ...input,
    })),
    onUpload: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  render(<PublicationEditor {...properties} />);
  return properties;
}

describe("发布草稿编辑器", () => {
  it("停止输入后自动落盘草稿本身", async () => {
    vi.useFakeTimers();
    try {
      const properties = renderEditor();
      fireEvent.change(screen.getByLabelText("标题"), {
        target: { value: "自动保存的标题" },
      });
      await act(async () => {
        vi.advanceTimersByTime(1300);
      });

      expect(properties.onSave).toHaveBeenCalledTimes(1);
      const [payload] = vi.mocked(properties.onSave).mock.calls[0];
      expect(payload).toEqual(expect.objectContaining({ title: "自动保存的标题" }));
      // 自动保存曾被接到按资源顺序保存的那条回调上，整份草稿被当成
      // assetOrder 塞进 asset_order 发出去；这里盯住载荷不能有这个字段。
      expect(payload).not.toHaveProperty("asset_order");
      expect(screen.getByText("草稿已自动保存")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("保存前规范化标题、标签与商品", async () => {
    const properties = renderEditor();
    fireEvent.change(screen.getByLabelText("标题"), { target: { value: "  新标题  " } });
    // 标签逐个确认：井号会被去掉，重复项不会再次加入。
    const tagInput = screen.getByLabelText("话题标签");
    for (const value of ["#标签", "标签", "第二个"]) {
      fireEvent.change(tagInput, { target: { value } });
      fireEvent.keyDown(tagInput, { key: "Enter" });
    }
    fireEvent.change(screen.getByLabelText("可见范围"), { target: { value: "mutual" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /声明原创/ }));
    fireEvent.change(screen.getByLabelText("绑定商品"), {
      target: { value: "合成商品 A\n合成商品 A\n合成商品 B" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存草稿" }));

    await waitFor(() => expect(properties.onSave).toHaveBeenCalled());
    expect(properties.onSave).toHaveBeenLastCalledWith(
      expect.objectContaining({
        title: "新标题",
        // 新增标签是追加而不是整体替换，草稿原有标签得以保留。
        tags: ["合成", "测试", "标签", "第二个"],
        visibility: "mutual",
        is_original: true,
        products: ["合成商品 A", "合成商品 B"],
      }),
    );
  });

  it("软件自带浏览器模式前置锁住可见范围与商品", () => {
    renderEditor({
      browserDriver: "managed",
      draft: makePublicationDraft({ visibility: "public", products: ["合成商品"] }),
    });

    expect(screen.getByLabelText("可见范围")).toBeDisabled();
    expect(screen.getByLabelText("可见范围")).toHaveValue("private");
    expect(screen.getByLabelText("绑定商品")).toBeDisabled();
    expect(
      screen.getByText("用软件自带浏览器发布时固定为仅自己可见，也不能绑定商品。"),
    ).toBeInTheDocument();
  });

  it("锁住选项只是界面前置，保存的仍是草稿本来的内容", async () => {
    // 收紧发生在提交那一刻并由服务端读取；这里提前把它写回草稿，
    // 用户切回浏览器扩展模式时已填的商品就没了。
    const properties = renderEditor({
      browserDriver: "managed",
      draft: makePublicationDraft({ visibility: "public", products: ["合成商品"] }),
    });

    fireEvent.click(screen.getByRole("button", { name: "保存草稿" }));

    await waitFor(() => expect(properties.onSave).toHaveBeenCalled());
    expect(properties.onSave).toHaveBeenLastCalledWith(
      expect.objectContaining({ visibility: "public", products: ["合成商品"] }),
    );
  });

  it("视频草稿禁用原创声明", () => {
    renderEditor({
      draft: makePublicationDraft({
        assets: [
          {
            ...makePublicationDraft().assets[0],
            filename: "synthetic.mp4",
            media_type: "video/mp4",
          },
        ],
        is_original: true,
      }),
    });

    expect(screen.getByRole("checkbox", { name: /声明原创/ })).toBeDisabled();
  });

  it("素材重排不会提前覆盖草稿的公开范围和商品", async () => {
    const first = makePublicationDraft().assets[0];
    const properties = renderEditor({
      draft: makePublicationDraft({
        visibility: "public",
        products: ["合成商品"],
        assets: [
          first,
          { ...first, asset_id: "synthetic-second-asset", filename: "second.jpeg", position: 1 },
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

  it("上传、删除素材和删除草稿", async () => {
    const properties = renderEditor();
    const file = new File(["value"], "second.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("添加素材"), { target: { files: [file] } });
    await waitFor(() => expect(properties.onUpload).toHaveBeenCalledWith(file));

    fireEvent.click(screen.getByRole("button", { name: /删除 synthetic/ }));
    await waitFor(() => expect(properties.onRemoveAsset).toHaveBeenCalledWith("synthetic-asset"));

    fireEvent.click(screen.getByRole("button", { name: "删除草稿" }));
    // 确认框里的「删除草稿」才是真正执行的那一下。
    fireEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", { name: "删除草稿" }),
    );
    await waitFor(() => expect(properties.onDelete).toHaveBeenCalled());
  });
});
