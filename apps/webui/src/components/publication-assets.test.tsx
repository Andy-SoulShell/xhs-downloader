import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

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
    expect(
      screen.getByRole("button", { name: "下移 video.mp4" }),
    ).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "下移 bytes.png" }));
    await waitFor(() =>
      expect(onMove).toHaveBeenCalledWith(["kib", "bytes", "video"]),
    );
    fireEvent.click(screen.getByRole("button", { name: "删除 video.mp4" }));
    expect(onRemove).toHaveBeenCalledWith("video");
  });

  it("上传所选文件并忽略空选择", async () => {
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

    const file = new File(["value"], "asset.png");
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(onUpload).toHaveBeenCalledWith([file]));
  });
});
