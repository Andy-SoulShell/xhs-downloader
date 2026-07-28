import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { summarizeDrafts } from "../lib/publication-index";
import { makePublicationDraft, makePublicationTask } from "../test/fixtures";
import { PublicationDraftList } from "./publication-draft-list";

function renderList(overrides: Partial<Parameters<typeof PublicationDraftList>[0]> = {}) {
  const drafts = overrides.drafts ?? [makePublicationDraft()];
  const properties = {
    drafts,
    visibleDrafts: drafts,
    summaries: summarizeDrafts(drafts, []),
    keyword: "",
    loading: false,
    onCreate: vi.fn(),
    onEdit: vi.fn(),
    onKeywordChange: vi.fn(),
    onOpen: vi.fn(),
    onRecords: vi.fn(),
    onStageChange: vi.fn(),
    schedules: {},
    stage: "all" as const,
    ...overrides,
  };
  render(<PublicationDraftList {...properties} />);
  return properties;
}

describe("草稿列表", () => {
  it("取回条数触到上限时说明还有更早的没显示", () => {
    renderList({ truncatedAt: 200 });

    // 搜索是纯客户端、只覆盖已取回的那批，不能写成"用搜索找更早的"。
    const notice = screen.getByText(/只列出最近 200 份草稿/);
    expect(notice).toBeInTheDocument();
    expect(notice.textContent).not.toContain("搜索");
  });

  it("没有触到上限就不提截断", () => {
    renderList();

    expect(screen.queryByText(/只列出最近/)).not.toBeInTheDocument();
  });

  it("筛没了和一份都没有说的不是同一句话", () => {
    const drafts = [makePublicationDraft()];
    renderList({ drafts, visibleDrafts: [], keyword: "找不到的词" });
    expect(screen.getByText("没有符合条件的草稿")).toBeInTheDocument();

    render(<div />);
    renderList({ drafts: [], visibleDrafts: [], summaries: new Map() });
    expect(screen.getByText("还没有发布草稿")).toBeInTheDocument();
  });

  it("卡片标出这份草稿本次会话里选好但还没提交的时间", () => {
    const draft = makePublicationDraft();
    renderList({ schedules: { [draft.draft_id]: "2026-08-01T10:00" } });

    expect(screen.getByText(/（未提交）/)).toBeInTheDocument();
  });

  it("徽标只说最近一次发布，不替快照声称草稿已发布", () => {
    const draft = makePublicationDraft();
    const task = makePublicationTask({ status: "published" });
    renderList({ summaries: summarizeDrafts([draft], [task]) });

    const card = screen.getByRole("listitem");
    expect(within(card).getByText("最近一次发布：已发布")).toBeInTheDocument();
  });

  it("点标题看详情，编辑和记录各走各的入口", () => {
    const draft = makePublicationDraft();
    const properties = renderList({
      summaries: summarizeDrafts([draft], [makePublicationTask()]),
    });

    fireEvent.click(screen.getByRole("button", { name: "合成发布标题" }));
    expect(properties.onOpen).toHaveBeenCalledWith(draft.draft_id);

    fireEvent.click(screen.getByRole("button", { name: "编辑" }));
    expect(properties.onEdit).toHaveBeenCalledWith(draft.draft_id);

    fireEvent.click(screen.getByRole("button", { name: /记录/ }));
    expect(properties.onRecords).toHaveBeenCalledWith(draft.draft_id);
  });

  it("从未提交过的草稿不给一个点不动的记录入口", () => {
    renderList();

    expect(screen.getByRole("button", { name: /记录/ })).toBeDisabled();
  });
});
