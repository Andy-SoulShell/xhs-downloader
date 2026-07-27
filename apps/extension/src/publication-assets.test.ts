import { webcrypto } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { assemblePublicationFile } from "./publication-assets";
import type { PublicationAsset } from "./publication-types";

const content = new TextEncoder().encode("synthetic-media");
const asset: PublicationAsset = {
  asset_id: "asset",
  filename: "synthetic.txt",
  media_type: "image/png",
  size: content.length,
  sha256: "767c65e1ef642dd32747defbadcf91ead72f111d6980e282d9f2a3f03705fd44",
  position: 0,
};

beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
});

afterEach(() => vi.unstubAllGlobals());

describe("发布素材组装", () => {
  it("按顺序组装并校验素材", async () => {
    const first = content.slice(0, 5);
    const second = content.slice(5);
    const loader = vi
      .fn()
      .mockResolvedValueOnce({
        base64: btoa(String.fromCharCode(...first)),
        offset: 0,
        nextOffset: 5,
        total: content.length,
        done: false,
      })
      .mockResolvedValueOnce({
        base64: btoa(String.fromCharCode(...second)),
        offset: 5,
        nextOffset: content.length,
        total: content.length,
        done: true,
      });

    const file = await assemblePublicationFile(asset, loader);

    expect(file.name).toBe("synthetic.txt");
    expect(file.type).toBe("image/png");
    expect(await file.text()).toBe("synthetic-media");
    expect(loader.mock.calls).toEqual([
      ["asset", 0],
      ["asset", 5],
    ]);
  });

  it("拒绝错序、提前结束、大小和摘要异常", async () => {
    await expect(
      assemblePublicationFile(asset, async () => ({
        base64: "",
        offset: 1,
        nextOffset: 2,
        total: asset.size,
        done: false,
      })),
    ).rejects.toThrow("分段顺序无效");
    await expect(
      assemblePublicationFile(asset, async () => ({
        base64: btoa("short"),
        offset: 0,
        nextOffset: 5,
        total: asset.size,
        done: true,
      })),
    ).rejects.toThrow("提前结束");
    await expect(
      assemblePublicationFile({ ...asset, size: 5 }, async () => ({
        base64: btoa("tiny"),
        offset: 0,
        nextOffset: 5,
        total: 5,
        done: true,
      })),
    ).rejects.toThrow("大小校验失败");
    await expect(
      assemblePublicationFile({ ...asset, sha256: "0".repeat(64) }, async () => ({
        base64: btoa("synthetic-media"),
        offset: 0,
        nextOffset: content.length,
        total: content.length,
        done: true,
      })),
    ).rejects.toThrow("完整性校验失败");
  });
});
