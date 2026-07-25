import { webcrypto } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PublicationClaim } from "./publication-types";

vi.mock("./publisher.css", () => ({ default: "" }));

const claim: PublicationClaim = {
  task: {
    task_id: "synthetic-task",
    package: {
      draft_id: "synthetic-draft",
      title: "合成标题",
      body: "合成正文",
      tags: ["自动化"],
      visibility: "public",
      is_original: false,
      products: [],
      assets: [
        {
          asset_id: "synthetic-asset",
          filename: "synthetic.png",
          media_type: "image/png",
          size: 1,
          sha256:
            "2d711642b726b04401627ca9fbac32f5c8530fb1903cc4db02258717921a4881",
          position: 0,
        },
      ],
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    },
    package_fingerprint: "a".repeat(64),
    mode: "manual",
    status: "claimed",
    scheduled_at: "2026-01-01T00:00:00.000Z",
    lease_expires_at: "2099-01-01T00:05:00.000Z",
    attempts: 1,
    message: "等待发布",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  },
  lease_token: "synthetic-lease",
};

let transferred: File[] = [];

beforeEach(() => {
  vi.resetModules();
  history.replaceState({}, "", "/publish?xhd_task=synthetic-task");
  document.head.innerHTML = "";
  document.body.innerHTML = `
    <button role="tab">上传图文</button>
    <input type="file" accept="image/*" />
    <input placeholder="填写标题" />
    <div class="ProseMirror" contenteditable="true"></div>
    <div class="permission-card-wrapper">
      <div class="d-select-content">公开可见</div>
    </div>
    <button id="publish">发布</button>
  `;
  transferred = [];
  let attached: FileList | null = null;
  const fileInput = document.querySelector<HTMLInputElement>("input[type=file]")!;
  Object.defineProperty(fileInput, "files", {
    configurable: true,
    get: () => attached,
    set: (value: FileList | null) => {
      attached = value;
    },
  });
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal(
    "DataTransfer",
    class {
      items = { add: (file: File) => transferred.push(file) };
      get files() {
        return transferred as unknown as FileList;
      }
    },
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("创作页自动发布流程", () => {
  it("校验素材、填写内容并以防重顺序提交状态", async () => {
    const events: string[] = [];
    document.querySelector("#publish")?.addEventListener("click", () => {
      events.push("click");
      const notice = document.createElement("div");
      notice.setAttribute("role", "alert");
      notice.textContent = "发布成功";
      document.body.append(notice);
    });
    const sendMessage = vi.fn(async (request: { type: string; status?: string }) => {
      if (request.type === "publication-prepare") {
        return { ok: true, message: "已准备", claim };
      }
      if (request.type === "publication-asset-chunk") {
        return {
          ok: true,
          message: "已读取",
          chunk: {
            base64: "eA==",
            offset: 0,
            nextOffset: 1,
            total: 1,
            done: true,
          },
        };
      }
      events.push(request.status ?? "");
      return { ok: true, message: "状态已更新" };
    });
    vi.stubGlobal("chrome", { runtime: { sendMessage } });

    await import("./publisher");
    await vi.waitFor(() => {
      expect(events).toContain("published");
    });

    expect((document.querySelector("input[placeholder]") as HTMLInputElement).value)
      .toBe("合成标题");
    expect(document.querySelector(".ProseMirror")?.textContent).toBe(
      "合成正文\n#自动化",
    );
    expect(events).toEqual(["filling", "publishing", "click", "published"]);
    expect(document.querySelector("#xhd-publish-status")?.textContent).toBe(
      "发布成功",
    );
  });

  it("按素材顺序组装并上传多张图片", async () => {
    const multiple = structuredClone(claim);
    multiple.task.package.assets = [
      {
        ...multiple.task.package.assets[0],
        asset_id: "second",
        filename: "second.png",
        position: 1,
      },
      {
        ...multiple.task.package.assets[0],
        asset_id: "first",
        filename: "first.png",
        position: 0,
      },
    ];
    const sendMessage = vi.fn(async (request: { type: string }) => {
      if (request.type === "publication-prepare") {
        return { ok: true, message: "已准备", claim: multiple };
      }
      if (request.type === "publication-asset-chunk") {
        return {
          ok: true,
          message: "已读取",
          chunk: {
            base64: "eA==",
            offset: 0,
            nextOffset: 1,
            total: 1,
            done: true,
          },
        };
      }
      return { ok: true, message: "状态已更新" };
    });
    document.querySelector("#publish")?.addEventListener("click", () => {
      history.replaceState({}, "", "/publish/success");
    });
    vi.stubGlobal("chrome", { runtime: { sendMessage } });

    await import("./publisher");
    await vi.waitFor(() => {
      expect(transferred.map((file) => file.name)).toEqual([
        "first.png",
        "second.png",
      ]);
      expect(sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "published",
          type: "publication-status",
        }),
      );
    });
  });
});
