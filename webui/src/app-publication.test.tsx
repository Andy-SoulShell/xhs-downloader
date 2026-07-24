import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import App from "./app";
import {
  checkHealth,
  getSettings,
  listClientRecords,
  listTasks,
} from "./lib/api";
import {
  listPublicationDrafts,
  listPublicationTasks,
} from "./lib/publication-api";
import {
  makePublicationDraft,
  makeSettingsResponse,
} from "./test/fixtures";

vi.mock("./lib/api", () => ({
  checkHealth: vi.fn(),
  getSettings: vi.fn(),
  listClientRecords: vi.fn(),
  listTasks: vi.fn(),
  retryTask: vi.fn(),
  submitDetail: vi.fn(),
  submitTask: vi.fn(),
  updateSettings: vi.fn(),
}));
vi.mock("./lib/publication-api", () => ({
  cancelPublicationTask: vi.fn(),
  createPublicationDraft: vi.fn(),
  deletePublicationDraft: vi.fn(),
  listPublicationDrafts: vi.fn(),
  listPublicationTasks: vi.fn(),
  removePublicationAsset: vi.fn(),
  retryPublicationTask: vi.fn(),
  submitPublicationTask: vi.fn(),
  updatePublicationDraft: vi.fn(),
  uploadPublicationAsset: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(checkHealth).mockResolvedValue(true);
  vi.mocked(getSettings).mockResolvedValue(makeSettingsResponse());
  vi.mocked(listClientRecords).mockResolvedValue([]);
  vi.mocked(listTasks).mockResolvedValue([]);
  vi.mocked(listPublicationTasks).mockResolvedValue([]);
});

describe("发布中心主导航集成", () => {
  it("从工作台导航进入已有草稿", async () => {
    vi.mocked(listPublicationDrafts).mockResolvedValue([
      makePublicationDraft(),
    ]);
    render(<App />);

    fireEvent.click(
      await screen.findByRole("button", { name: "发布中心" }),
    );

    expect(await screen.findByLabelText("当前草稿")).toBeInTheDocument();
    expect(screen.getByLabelText("标题")).toHaveValue("合成发布标题");
  });
});
