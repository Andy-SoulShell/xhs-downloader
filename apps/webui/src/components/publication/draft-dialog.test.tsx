import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { draftSummary } from "../../lib/publication-index";
import { makePublicationDraft, makePublicationTask } from "../../test/fixtures";
import { PublicationDraftDialog } from "./draft-dialog";

type DialogProps = Parameters<typeof PublicationDraftDialog>[0];

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** 计划时间由发布中心按草稿保管，测试要走完"填时间 → 提交"就得有人接住它。 */
function Host(properties: Omit<DialogProps, "scheduledAt" | "onScheduledAtChange">) {
  const [scheduledAt, setScheduledAt] = useState("");
  return (
    <PublicationDraftDialog
      {...properties}
      onScheduledAtChange={setScheduledAt}
      scheduledAt={scheduledAt}
    />
  );
}

function renderDialog(overrides: Partial<DialogProps> = {}) {
  const draft = overrides.draft ?? makePublicationDraft();
  const properties = {
    browserDriver: "extension" as const,
    draft,
    onNotify: vi.fn(),
    onOpenChange: vi.fn(),
    onSave: vi.fn().mockResolvedValue(draft),
    onSubmitManual: vi.fn().mockResolvedValue(makePublicationTask()),
    onSubmitPlatformScheduled: vi
      .fn()
      .mockResolvedValue(makePublicationTask({ mode: "platform_scheduled" })),
    onSubmitScheduled: vi
      .fn()
      .mockResolvedValue(makePublicationTask({ mode: "scheduled", status: "scheduled" })),
    open: true,
    summary: draftSummary(draft, []),
    ...overrides,
  };
  render(<Host {...properties} />);
  return properties;
}

function popupStub() {
  const popup = { close: vi.fn(), location: { href: "" }, opener: window };
  vi.spyOn(window, "open").mockReturnValue(popup as unknown as Window);
  return popup;
}

function localDateTime(instant: Date): string {
  return new Date(instant.getTime() - instant.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

describe("草稿详情里的发布", () => {
  it("先呈现要发的内容，再给发布入口", () => {
    renderDialog();

    expect(screen.getByText("合成发布正文")).toBeInTheDocument();
    expect(screen.getByText("#合成")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "立即发布" })).toBeEnabled();
  });

  it("缺内容或缺素材时按钮停用并当场说清缺什么", () => {
    // 此前要先点开那张写着"发出去之后这边撤不回来"的确认卡，确认之后才收到
    // 一句"请至少添加素材"，用完一次就学会无脑点确认。
    renderDialog({ draft: makePublicationDraft({ title: "", body: "" }) });
    expect(screen.getByRole("button", { name: "立即发布" })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("标题和正文不能同时为空");
    expect(screen.queryByRole("button", { name: "确认立即发布" })).not.toBeInTheDocument();
    cleanup();

    renderDialog({ draft: makePublicationDraft({ assets: [] }) });
    expect(screen.getByRole("button", { name: "本地定时" })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("请至少添加一个发布素材");
  });

  it("立即发布落库后打开创作页", async () => {
    const popup = popupStub();
    const properties = renderDialog();

    fireEvent.click(screen.getByRole("button", { name: "立即发布" }));
    expect(properties.onSubmitManual).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "确认立即发布" }));

    await waitFor(() => expect(properties.onSubmitManual).toHaveBeenCalled());
    expect(popup.opener).toBeNull();
    expect(popup.location.href).toContain("creator.xiaohongshu.com/publish/publish");
    expect(popup.location.href).toContain("xhd_task=synthetic-publication-task");
    expect(properties.onNotify).toHaveBeenCalledWith("发布任务已交给浏览器扩展");
  });

  it("弹窗被拦时指一条还能走的路", async () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    const properties = renderDialog();

    fireEvent.click(screen.getByRole("button", { name: "立即发布" }));
    fireEvent.click(screen.getByRole("button", { name: "确认立即发布" }));

    await waitFor(() =>
      expect(properties.onNotify).toHaveBeenCalledWith("扩展任务已就绪，请从发布任务里打开创作页"),
    );
  });

  it("本地定时拒绝无效时间，有效时间才提交", async () => {
    const properties = renderDialog();
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
    const popup = popupStub();
    const properties = renderDialog();

    fireEvent.change(screen.getByLabelText("计划发布时间"), {
      target: { value: localDateTime(new Date(Date.now() + 2 * 60 * 60_000)) },
    });
    fireEvent.click(screen.getByRole("button", { name: "官方定时" }));
    fireEvent.click(screen.getByRole("button", { name: "确认官方定时" }));

    await waitFor(() => expect(properties.onSubmitPlatformScheduled).toHaveBeenCalled());
    expect(popup.location.href).toContain("xhd_task=");
    expect(properties.onNotify).toHaveBeenCalledWith("官方定时任务已交给扩展设置");
  });

  it("返回修改可以撤回确认", () => {
    const properties = renderDialog();

    fireEvent.click(screen.getByRole("button", { name: "立即发布" }));
    expect(screen.getByText(/发出去之后这边撤不回来/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "返回修改" }));

    expect(properties.onSubmitManual).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("发布确认")).not.toBeInTheDocument();
  });
});

describe("软件自带浏览器模式下的发布", () => {
  const managed = () =>
    renderDialog({
      browserDriver: "managed",
      draft: makePublicationDraft({ visibility: "public", products: ["合成商品"] }),
      onSubmitManual: vi.fn().mockResolvedValue(makePublicationTask({ target_driver: "managed" })),
      onSubmitScheduled: vi
        .fn()
        .mockResolvedValue(
          makePublicationTask({ mode: "scheduled", status: "scheduled", target_driver: "managed" }),
        ),
      onSubmitPlatformScheduled: vi
        .fn()
        .mockResolvedValue(
          makePublicationTask({ mode: "platform_scheduled", target_driver: "managed" }),
        ),
    });

  it("立即发布把内容收紧为私密无商品，且不打开日常浏览器", async () => {
    const open = vi.spyOn(window, "open");
    const properties = managed();

    fireEvent.click(screen.getByRole("button", { name: "立即发布" }));
    fireEvent.click(screen.getByRole("button", { name: "确认立即发布" }));

    await waitFor(() => expect(properties.onSubmitManual).toHaveBeenCalled());
    expect(properties.onSave).toHaveBeenCalledWith(
      expect.objectContaining({ visibility: "private", products: [] }),
    );
    expect(open).not.toHaveBeenCalled();
    expect(properties.onNotify).toHaveBeenCalledWith("发布任务已交给软件自带浏览器");
  });

  it("本地定时与官方定时同样收紧且不开日常浏览器", async () => {
    const open = vi.spyOn(window, "open");
    const properties = managed();

    fireEvent.change(screen.getByLabelText("计划发布时间"), {
      target: { value: "2099-01-02T03:04" },
    });
    fireEvent.click(screen.getByRole("button", { name: "本地定时" }));
    fireEvent.click(screen.getByRole("button", { name: "确认本地定时" }));
    await waitFor(() => expect(properties.onSubmitScheduled).toHaveBeenCalled());
    expect(properties.onNotify).toHaveBeenCalledWith(
      "本地定时任务已保存，届时由软件自带浏览器执行",
    );

    fireEvent.change(screen.getByLabelText("计划发布时间"), {
      target: { value: localDateTime(new Date(Date.now() + 2 * 60 * 60_000)) },
    });
    fireEvent.click(screen.getByRole("button", { name: "官方定时" }));
    fireEvent.click(screen.getByRole("button", { name: "确认官方定时" }));
    await waitFor(() => expect(properties.onSubmitPlatformScheduled).toHaveBeenCalled());
    expect(properties.onNotify).toHaveBeenCalledWith("官方定时任务已交给软件自带浏览器设置");

    expect(properties.onSave).toHaveBeenCalledWith(
      expect.objectContaining({ visibility: "private", products: [] }),
    );
    expect(open).not.toHaveBeenCalled();
  });

  it("以后端冻结的连接方式为准，关掉误开的扩展弹窗", async () => {
    const popup = popupStub();
    const properties = renderDialog({
      onSubmitManual: vi.fn().mockResolvedValue(makePublicationTask({ target_driver: "managed" })),
    });

    fireEvent.click(screen.getByRole("button", { name: "立即发布" }));
    fireEvent.click(screen.getByRole("button", { name: "确认立即发布" }));

    await waitFor(() => expect(popup.close).toHaveBeenCalled());
    expect(popup.location.href).toBe("");
    expect(properties.onNotify).toHaveBeenCalledWith("发布任务已交给软件自带浏览器");
  });

  it("未知连接方式关掉弹窗并停止后续导航", async () => {
    const popup = popupStub();
    const properties = renderDialog({
      onSubmitManual: vi
        .fn()
        .mockResolvedValue({ ...makePublicationTask(), target_driver: "future" } as never),
    });

    fireEvent.click(screen.getByRole("button", { name: "立即发布" }));
    fireEvent.click(screen.getByRole("button", { name: "确认立即发布" }));

    await waitFor(() =>
      expect(properties.onNotify).toHaveBeenCalledWith("发布任务返回了不支持的连接方式"),
    );
    expect(popup.close).toHaveBeenCalled();
    expect(popup.location.href).toBe("");
  });
});
