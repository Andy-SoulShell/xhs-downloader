import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createPublicationDraft,
  listPublicationDrafts,
  listPublicationTasks,
  resumePublicationVerification,
  retryPublicationTask,
} from "../../lib/publication-api";
import { PublicationCenterProvider } from "../../lib/publication-center-provider";
import { makePublicationDraft, makePublicationTask } from "../../test/fixtures";
import { PublicationBoard } from "./board";

/** 发布中心已提到应用根部共享，组件测试也得在同一个提供者里渲染。 */
function renderBoard(ui: ReactElement) {
  return render(<PublicationCenterProvider>{ui}</PublicationCenterProvider>);
}

vi.mock("../../lib/publication-api", () => ({
  DRAFT_PAGE_LIMIT: 200,
  publicationAssetUrl: (draftId: string, assetId: string) =>
    `/api/publication/drafts/${draftId}/assets/${assetId}`,
  cancelPublicationTask: vi.fn(),
  createPublicationDraft: vi.fn(),
  deletePublicationDraft: vi.fn(),
  listPublicationDrafts: vi.fn(),
  listPublicationTasks: vi.fn(),
  removePublicationAsset: vi.fn(),
  resumePublicationVerification: vi.fn(),
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

describe("发布中心界面", () => {
  it("执行驱动尚未确认时不允许编辑或提交发布", async () => {
    vi.mocked(listPublicationDrafts).mockResolvedValue([makePublicationDraft()]);
    renderBoard(<PublicationBoard onNotify={vi.fn()} />);

    expect(
      screen.getByText("暂时无法确认发布方式，新建和提交已停用；已有任务仍可核对或恢复。"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "编辑" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "立即发布" })).not.toBeInTheDocument();
  });

  it("未知连接方式阻止新提交但保留冻结任务的恢复入口", async () => {
    vi.mocked(listPublicationDrafts).mockResolvedValue([makePublicationDraft()]);
    vi.mocked(listPublicationTasks).mockResolvedValue([
      makePublicationTask({
        task_id: "synthetic-verification",
        status: "awaiting_verification",
        target_driver: "managed",
      }),
      makePublicationTask({
        task_id: "synthetic-review",
        status: "needs_review",
        target_driver: "managed",
      }),
    ]);

    renderBoard(<PublicationBoard browserDriver="future-browser-driver" onNotify={vi.fn()} />);

    expect(screen.queryByRole("button", { name: "编辑" })).not.toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: "我已完成验证，继续原任务" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "没发出去" })).toBeInTheDocument();
  });

  it("从空状态新建草稿后直接进编辑框", async () => {
    const draft = makePublicationDraft();
    vi.mocked(createPublicationDraft).mockResolvedValue(draft);
    const onNotify = vi.fn();
    renderBoard(<PublicationBoard browserDriver="extension" onNotify={onNotify} />);

    fireEvent.click(await screen.findByRole("button", { name: "新建第一份草稿" }));

    // 刚建出来的草稿是空的，先要的是填内容，不是看详情。
    const editor = await screen.findByRole("dialog");
    expect(within(editor).getByLabelText("标题")).toHaveValue(draft.title);
    expect(onNotify).toHaveBeenCalledWith("已新建发布草稿");
  });

  it("点卡片看详情，编辑和记录各自是独立的框", async () => {
    const draft = makePublicationDraft();
    vi.mocked(listPublicationDrafts).mockResolvedValue([draft]);
    vi.mocked(listPublicationTasks).mockResolvedValue([makePublicationTask()]);
    renderBoard(<PublicationBoard browserDriver="extension" onNotify={vi.fn()} />);

    // 没打开任何框之前，编辑表单不该已经摊在页面上。
    expect(screen.queryByLabelText("正文")).not.toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: "合成发布标题" }));
    const detail = await screen.findByRole("dialog");
    expect(within(detail).getByRole("button", { name: "立即发布" })).toBeInTheDocument();
    expect(within(detail).queryByLabelText("正文")).not.toBeInTheDocument();
    fireEvent.click(within(detail).getByRole("button", { name: "关闭" }));

    fireEvent.click(await screen.findByRole("button", { name: "编辑" }));
    const editor = await screen.findByRole("dialog");
    expect(within(editor).getByLabelText("正文")).toBeInTheDocument();
    // 发布记录不再寄生在表单底部。
    expect(within(editor).queryByText("发布记录")).not.toBeInTheDocument();
    fireEvent.click(within(editor).getByRole("button", { name: "关闭" }));

    fireEvent.click(await screen.findByRole("button", { name: /记录/ }));
    const records = await screen.findByRole("dialog");
    expect(within(records).getByText(/发布记录/)).toBeInTheDocument();
  });

  it("关掉框后焦点回到打开它的那颗按钮", async () => {
    vi.mocked(listPublicationDrafts).mockResolvedValue([makePublicationDraft()]);
    renderBoard(<PublicationBoard browserDriver="extension" onNotify={vi.fn()} />);

    const edit = await screen.findByRole("button", { name: "编辑" });
    edit.focus();
    fireEvent.click(edit);
    const editor = await screen.findByRole("dialog");
    fireEvent.click(within(editor).getByRole("button", { name: "关闭" }));

    // 这些框由外部状态控制，Radix 不知道该把焦点还给谁；不自己还回去，
    // 键盘用户按一次 Esc 就被丢回文档开头。
    await waitFor(() => expect(edit).toHaveFocus());
  });

  it("在发布任务里重试，并能回到它的源草稿", async () => {
    const draft = makePublicationDraft();
    const task = makePublicationTask({ status: "failed", message: "合成发布失败" });
    vi.mocked(listPublicationDrafts).mockResolvedValue([draft]);
    vi.mocked(listPublicationTasks).mockResolvedValue([task]);
    vi.mocked(retryPublicationTask).mockResolvedValue({ ...task, status: "ready" });
    const onNotify = vi.fn();
    renderBoard(<PublicationBoard browserDriver="extension" onNotify={onNotify} />);

    fireEvent.mouseDown(await screen.findByRole("tab", { name: /发布任务/ }));
    const list = screen.getByRole("region", { name: "发布任务" });
    fireEvent.click(within(list).getByRole("button", { name: "重试" }));
    await waitFor(() => expect(retryPublicationTask).toHaveBeenCalledWith(task.task_id));
    expect(onNotify).toHaveBeenCalledWith("发布任务已重新就绪");

    fireEvent.click(within(list).getByRole("button", { name: "查看源草稿" }));
    expect(await screen.findByRole("dialog")).toHaveTextContent("合成发布标题");
  });

  it("源草稿已经删掉的任务不留一个点不动的入口", async () => {
    vi.mocked(listPublicationDrafts).mockResolvedValue([
      makePublicationDraft({ draft_id: "别的" }),
    ]);
    vi.mocked(listPublicationTasks).mockResolvedValue([
      makePublicationTask({ status: "published" }),
    ]);
    renderBoard(<PublicationBoard browserDriver="extension" onNotify={vi.fn()} />);

    fireEvent.mouseDown(await screen.findByRole("tab", { name: /发布任务/ }));

    expect(screen.queryByRole("button", { name: "查看源草稿" })).not.toBeInTheDocument();
  });

  it("展示发布中心读取错误", async () => {
    vi.mocked(listPublicationDrafts).mockRejectedValue(new Error("本地发布服务不可用"));
    renderBoard(<PublicationBoard browserDriver="extension" onNotify={vi.fn()} />);

    expect(await screen.findByText("本地发布服务不可用")).toBeInTheDocument();
    expect(screen.getByText("还没有发布草稿")).toBeInTheDocument();
  });

  it("在记录框里二次确认后恢复等待验证的原任务", async () => {
    const task = makePublicationTask({
      status: "awaiting_verification",
      target_driver: "managed",
      message: "请在软件自带浏览器完成验证",
    });
    vi.mocked(listPublicationDrafts).mockResolvedValue([makePublicationDraft()]);
    vi.mocked(listPublicationTasks).mockResolvedValue([task]);
    vi.mocked(resumePublicationVerification).mockResolvedValue({
      task_id: task.task_id,
      resumed: true,
      publish_attempted: false,
      message: "已确认安全验证完成，软件自带发布将在原页面继续",
    });
    const onNotify = vi.fn();
    renderBoard(<PublicationBoard browserDriver="managed" onNotify={onNotify} />);

    fireEvent.click(await screen.findByRole("button", { name: /记录/ }));
    const records = await screen.findByRole("dialog");
    fireEvent.click(within(records).getByRole("button", { name: "我已完成验证，继续原任务" }));
    expect(resumePublicationVerification).not.toHaveBeenCalled();
    fireEvent.click(within(records).getByRole("button", { name: "确认验证完成并继续" }));

    await waitFor(() => expect(resumePublicationVerification).toHaveBeenCalledWith(task.task_id));
    expect(onNotify).toHaveBeenCalledWith("已确认验证完成，原发布任务正在继续");
  });
});
