import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { UserFacingError } from "../lib/error-message";
import { makePublicationDraft } from "../test/fixtures";
import { PublicationAssets } from "./publication-assets";

describe("发布素材列表", () => {
  it("区分媒体、格式化大小并调整完整顺序", async () => {
    const base = makePublicationDraft().assets[0];
    const draft = makePublicationDraft({
      assets: [
        { ...base, asset_id: "bytes", filename: "bytes.png", size: 10 },
        {
          ...base,
          asset_id: "kib",
          filename: "kib.png",
          size: 2048,
          position: 1,
        },
        {
          ...base,
          asset_id: "video",
          filename: "video.mp4",
          media_type: "video/mp4",
          size: 2 * 1024 * 1024,
          position: 2,
        },
      ],
    });
    const onMove = vi.fn().mockResolvedValue(undefined);
    const onRemove = vi.fn().mockResolvedValue(undefined);
    render(
      <PublicationAssets
        busy={false}
        draft={draft}
        onMove={onMove}
        onRemove={onRemove}
        onUpload={vi.fn()}
      />,
    );

    expect(screen.getByText("10 B")).toBeInTheDocument();
    expect(screen.getByText("2.0 KiB")).toBeInTheDocument();
    expect(screen.getByText("2.0 MiB")).toBeInTheDocument();
    expect(screen.getByText("视频")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "上移 bytes.png" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "下移 video.mp4" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "下移 bytes.png" }));
    await waitFor(() => expect(onMove).toHaveBeenCalledWith(["kib", "bytes", "video"]));
    fireEvent.click(screen.getByRole("button", { name: "删除 video.mp4" }));
    expect(onRemove).toHaveBeenCalledWith("video");
  });

  it("拖到别处就把封面换成那一项", async () => {
    const base = makePublicationDraft().assets[0];
    const draft = makePublicationDraft({
      assets: [
        { ...base, asset_id: "一", filename: "一.png" },
        { ...base, asset_id: "二", filename: "二.png", position: 1 },
        { ...base, asset_id: "三", filename: "三.png", position: 2 },
      ],
    });
    const onMove = vi.fn().mockResolvedValue(undefined);
    render(
      <PublicationAssets
        busy={false}
        draft={draft}
        onMove={onMove}
        onRemove={vi.fn()}
        onUpload={vi.fn()}
      />,
    );

    const cards = screen
      .getAllByText(/^[一二三]\.png$/)
      .map((node) => node.closest("[draggable]")!);
    const transfer = { setData: vi.fn(), dropEffect: "", effectAllowed: "" };
    fireEvent.dragStart(cards[2], { dataTransfer: transfer });
    fireEvent.dragOver(cards[0], { dataTransfer: transfer });
    fireEvent.drop(cards[0], { dataTransfer: transfer });

    await waitFor(() => expect(onMove).toHaveBeenCalledWith(["三", "一", "二"]));
  });

  it("逐个上传所选文件并忽略空选择", async () => {
    const onUpload = vi.fn().mockResolvedValue(undefined);
    render(
      <PublicationAssets
        busy={false}
        draft={makePublicationDraft({ assets: [] })}
        onMove={vi.fn()}
        onRemove={vi.fn()}
        onUpload={onUpload}
      />,
    );
    expect(screen.getByText("还没有添加素材")).toBeInTheDocument();
    const input = screen.getByLabelText("添加素材");
    fireEvent.change(input, { target: { files: [] } });
    expect(onUpload).not.toHaveBeenCalled();

    const first = new File(["value"], "第一张.png", { type: "image/png" });
    const second = new File(["value"], "第二张.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [first, second] } });

    await waitFor(() => expect(onUpload).toHaveBeenCalledTimes(2));
    expect(onUpload.mock.calls).toEqual([[first], [second]]);
    expect(await screen.findByText("素材添加完成")).toBeInTheDocument();
  });

  it("失败的那个单独重试，不牵连同批的其它文件", async () => {
    const onUpload = vi
      .fn()
      .mockRejectedValueOnce(new UserFacingError("素材超过单个文件大小上限"))
      .mockResolvedValue(undefined);
    render(
      <PublicationAssets
        busy={false}
        draft={makePublicationDraft({ assets: [] })}
        onMove={vi.fn()}
        onRemove={vi.fn()}
        onUpload={onUpload}
      />,
    );

    const bad = new File(["value"], "坏了.png", { type: "image/png" });
    const good = new File(["value"], "好的.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("添加素材"), { target: { files: [bad, good] } });

    expect(await screen.findByText("素材超过单个文件大小上限")).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByText("已添加")).toHaveLength(1));

    fireEvent.click(screen.getByRole("button", { name: "重新添加 坏了.png" }));
    await waitFor(() => expect(screen.getAllByText("已添加")).toHaveLength(2));
    expect(onUpload).toHaveBeenCalledTimes(3);
  });

  it("超出配额的文件不发出去，并说清楚为什么", async () => {
    const base = makePublicationDraft().assets[0];
    const onUpload = vi.fn().mockResolvedValue(undefined);
    render(
      <PublicationAssets
        busy={false}
        draft={makePublicationDraft({ assets: [{ ...base, media_type: "video/mp4" }] })}
        onMove={vi.fn()}
        onRemove={vi.fn()}
        onUpload={onUpload}
      />,
    );

    const image = new File(["value"], "配图.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("添加素材"), { target: { files: [image] } });

    expect(screen.getByText("配图.png：图片不能和视频一起发")).toBeInTheDocument();
    expect(onUpload).not.toHaveBeenCalled();
  });
});
