import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { makePublicationDraft, makePublicationTask } from "../test/fixtures";
import { PublicationEditor } from "./publication-editor";

afterEach(() => vi.restoreAllMocks());

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
    onSubmitManual: vi.fn().mockResolvedValue(makePublicationTask()),
    onSubmitPlatformScheduled: vi
      .fn()
      .mockResolvedValue(makePublicationTask({ mode: "platform_scheduled" })),
    onSubmitScheduled: vi
      .fn()
      .mockResolvedValue(makePublicationTask({ mode: "scheduled", status: "scheduled" })),
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
    // 标签改为逐个确认的输入：井号会被去掉，重复项不会再次加入。
    const tagInput = screen.getByLabelText("话题标签");
    fireEvent.change(tagInput, { target: { value: "#标签" } });
    fireEvent.keyDown(tagInput, { key: "Enter" });
    fireEvent.change(tagInput, { target: { value: "标签" } });
    fireEvent.keyDown(tagInput, { key: "Enter" });
    fireEvent.change(tagInput, { target: { value: "第二个" } });
    fireEvent.keyDown(tagInput, { key: "Enter" });
    fireEvent.change(screen.getByLabelText("可见范围"), {
      target: { value: "mutual" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /声明原创/ }));
    fireEvent.change(screen.getByLabelText("绑定商品"), {
      target: { value: "合成商品 A\n合成商品 A\n合成商品 B" },
    });
    fireEvent.click(screen.getByRole("button", { name: "立即发布" }));
    expect(properties.onSubmitManual).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "确认立即发布" }));

    await waitFor(() => expect(properties.onSubmitManual).toHaveBeenCalled());
    expect(properties.onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "新标题",
        // 新增标签是追加而不是整体替换，草稿原有标签得以保留。
        tags: ["合成", "测试", "标签", "第二个"],
        visibility: "mutual",
        is_original: true,
        products: ["合成商品 A", "合成商品 B"],
      }),
    );
    expect(popup.opener).toBeNull();
    expect(popup.location.href).toContain("creator.xiaohongshu.com/publish/publish");
    expect(popup.location.href).toContain("xhd_task=synthetic-publication-task");
    expect(properties.onNotify).toHaveBeenCalledWith("发布任务已交给浏览器扩展");
  });

  it("校验空内容、缺失素材和被阻止的弹窗", async () => {
    const noContent = makePublicationDraft({ title: "", body: "" });
    const properties = renderEditor({ draft: noContent });
    fireEvent.click(screen.getByRole("button", { name: "立即发布" }));
    fireEvent.click(screen.getByRole("button", { name: "确认立即发布" }));
    await waitFor(() => expect(properties.onNotify).toHaveBeenCalledWith("标题和正文不能同时为空"));
    cleanup();

    const empty = makePublicationDraft({ assets: [] });
    const emptyProperties = renderEditor({ draft: empty });
    fireEvent.click(screen.getByRole("button", { name: "立即发布" }));
    fireEvent.click(screen.getByRole("button", { name: "确认立即发布" }));
    await waitFor(() =>
      expect(emptyProperties.onNotify).toHaveBeenCalledWith("请至少添加一个发布素材"),
    );
    cleanup();

    vi.spyOn(window, "open").mockReturnValue(null);
    const blocked = renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "立即发布" }));
    fireEvent.click(screen.getByRole("button", { name: "确认立即发布" }));
    await waitFor(() =>
      expect(blocked.onNotify).toHaveBeenCalledWith("扩展任务已就绪，请从任务列表打开创作页"),
    );
  });

  it("保存未来排期并拒绝无效时间", async () => {
    const properties = renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "本地定时" }));
    fireEvent.click(screen.getByRole("button", { name: "确认本地定时" }));
    await waitFor(() =>
      expect(properties.onNotify).toHaveBeenCalledWith("请选择有效的计划发布时间"),
    );
    fireEvent.change(screen.getByLabelText("计划发布时间"), {
      target: { value: "2020-01-02T03:04" },
    });
    fireEvent.click(screen.getByRole("button", { name: "本地定时" }));
    fireEvent.click(screen.getByRole("button", { name: "确认本地定时" }));
    await waitFor(() =>
      expect(properties.onNotify).toHaveBeenCalledWith("计划发布时间必须晚于当前时间"),
    );
    fireEvent.change(screen.getByLabelText("计划发布时间"), {
      target: { value: "2099-01-02T03:04" },
    });
    fireEvent.click(screen.getByRole("button", { name: "本地定时" }));
    fireEvent.click(screen.getByRole("button", { name: "确认本地定时" }));

    await waitFor(() =>
      expect(properties.onSubmitScheduled).toHaveBeenCalledWith(
        new Date("2099-01-02T03:04").toISOString(),
      ),
    );
    expect(properties.onNotify).toHaveBeenCalledWith("本地定时任务已保存，届时由浏览器扩展执行");
  });

  it("官方定时要求边界有效并打开创作页", async () => {
    const popup = {
      close: vi.fn(),
      location: { href: "" },
      opener: window,
    };
    vi.spyOn(window, "open").mockReturnValue(popup as unknown as Window);
    const properties = renderEditor();
    const schedule = new Date(Date.now() + 2 * 60 * 60_000);
    const local = new Date(schedule.getTime() - schedule.getTimezoneOffset() * 60_000)
      .toISOString()
      .slice(0, 16);
    fireEvent.change(screen.getByLabelText("计划发布时间"), {
      target: { value: local },
    });
    fireEvent.click(screen.getByRole("button", { name: "官方定时" }));
    fireEvent.click(screen.getByRole("button", { name: "确认官方定时" }));

    await waitFor(() => expect(properties.onSubmitPlatformScheduled).toHaveBeenCalled());
    expect(popup.location.href).toContain("xhd_task=");
    expect(properties.onNotify).toHaveBeenCalledWith("官方定时任务已交给扩展设置");
  });

  it("受管模式不打开日常浏览器并前置限制发布选项", async () => {
    const open = vi.spyOn(window, "open");
    const properties = renderEditor({
      browserDriver: "managed",
      draft: makePublicationDraft({
        visibility: "public",
        products: ["合成商品"],
      }),
      onSubmitManual: vi.fn().mockResolvedValue(makePublicationTask({ target_driver: "managed" })),
    });

    expect(screen.getByLabelText("可见范围")).toBeDisabled();
    expect(screen.getByLabelText("可见范围")).toHaveValue("private");
    expect(screen.getByLabelText("绑定商品")).toBeDisabled();
    expect(screen.getByText("受管浏览器首期固定为仅自己可见且不绑定商品。")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "保存草稿" }));
    await waitFor(() => expect(properties.onSave).toHaveBeenCalled());
    expect(properties.onSave).toHaveBeenLastCalledWith(
      expect.objectContaining({
        visibility: "public",
        products: ["合成商品"],
      }),
    );
    vi.clearAllMocks();

    fireEvent.click(screen.getByRole("button", { name: "立即发布" }));
    // 三种发布方式的确认文案现在各不相同，这里盯住“不可撤回”这个关键后果。
    expect(screen.getByText(/发出去之后这边撤不回来/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "确认立即发布" }));

    await waitFor(() => expect(properties.onSubmitManual).toHaveBeenCalled());
    expect(properties.onSave).toHaveBeenCalledWith(
      expect.objectContaining({ visibility: "private", products: [] }),
    );
    expect(open).not.toHaveBeenCalled();
    expect(properties.onNotify).toHaveBeenCalledWith("发布任务已交给受管浏览器");
  });

  it("视频草稿禁用原创声明，并可撤回发布确认", () => {
    const video = makePublicationDraft({
      assets: [
        {
          ...makePublicationDraft().assets[0],
          filename: "synthetic.mp4",
          media_type: "video/mp4",
        },
      ],
      is_original: true,
    });
    const properties = renderEditor({ draft: video });

    expect(screen.getByRole("checkbox", { name: /声明原创/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "立即发布" }));
    fireEvent.click(screen.getByRole("button", { name: "返回修改" }));
    expect(properties.onSubmitManual).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("发布确认")).not.toBeInTheDocument();
  });

  it("上传、排序、删除素材和草稿", async () => {
    const properties = renderEditor();
    const file = new File(["value"], "second.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("添加素材"), {
      target: { files: [file] },
    });
    await waitFor(() => expect(properties.onUpload).toHaveBeenCalledWith([file]));

    fireEvent.click(screen.getByRole("button", { name: /删除 synthetic/ }));
    await waitFor(() => expect(properties.onRemoveAsset).toHaveBeenCalledWith("synthetic-asset"));
    vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "删除草稿" }));
    // 确认框里的「删除草稿」才是真正执行的那一下。
    fireEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", { name: "删除草稿" }),
    );
    await waitFor(() => expect(properties.onDelete).toHaveBeenCalled());
  });
});
