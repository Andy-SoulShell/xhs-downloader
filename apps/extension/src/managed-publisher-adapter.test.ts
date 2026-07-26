import { beforeEach, describe, expect, it, vi } from "vitest";

import { installManagedPublisherAdapter } from "./managed-publisher-adapter";
import type {
  PublicationAsset,
  PublicationTask,
} from "./publication-types";

const adapter = installManagedPublisherAdapter();

beforeEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("受管浏览器发布页面适配器", () => {
  it("准备图文上传、填充私密原创内容且不代替执行器点击", async () => {
    installImageForm(true);
    const nativePublish = addNativePublishButton();
    const clicked = vi.spyOn(nativePublish, "click");
    const task = createTask({ isOriginal: true });

    await expect(adapter.prepareUpload(task)).resolves.toMatchObject({
      ok: true,
      action: "upload",
      mediaKind: "image",
      selector: "[data-xhd-managed-upload='true']",
    });
    expect(
      document.querySelector("[data-xhd-managed-upload='true']"),
    ).toBeInstanceOf(HTMLInputElement);

    await expect(adapter.fill(task)).resolves.toEqual({
      ok: true,
      message: "创作页内容和发布选项已核验",
    });
    expect(document.querySelector<HTMLInputElement>("[placeholder='标题']")?.value)
      .toBe("合成标题");
    expect(document.querySelector(".ProseMirror")?.textContent).toBe(
      "合成正文\n#合成标签",
    );
    expect(
      document.querySelector<HTMLInputElement>(".d-switch input")?.checked,
    ).toBe(true);

    await expect(adapter.preparePublish()).resolves.toMatchObject({
      ok: true,
      action: "click_selector",
      selector: "[data-xhd-managed-publish='true']",
    });
    expect(clicked).not.toHaveBeenCalled();
    expect(adapter.observeOutcome()).toEqual({
      ok: true,
      state: "pending",
      message: "等待创作平台确认",
    });
    document.body.insertAdjacentHTML(
      "beforeend",
      `<div role="alert">发布成功：合成标题</div>`,
    );
    expect(adapter.observeOutcome()).toMatchObject({
      ok: true,
      state: "published",
      message: "创作平台已确认发布成功",
    });
  });

  it("准备视频素材并等待可编辑表单出现", async () => {
    installBaseForm("video");
    const task = createTask({ mediaKind: "video" });

    await expect(adapter.prepareUpload(task)).resolves.toMatchObject({
      ok: true,
      mediaKind: "video",
    });
    await expect(adapter.fill(task)).resolves.toEqual({
      ok: true,
      message: "创作页内容和发布选项已核验",
    });
  });

  it("准备北京时间官方定时输入并在可信输入后严格回读", async () => {
    installBaseForm("image");
    document.body.insertAdjacentHTML(
      "beforeend",
      `
        <div class="post-time-wrapper">
          <div class="d-switch checked"></div>
        </div>
        <div class="date-picker-container"><input /></div>
      `,
    );
    const task = createTask({ mode: "platform_scheduled" });

    const prepared = await adapter.fill(task);

    expect(prepared).toMatchObject({
      ok: true,
      action: "type_schedule",
      selector: "[data-xhd-managed-schedule='true']",
      value: "2026-07-25 20:34",
    });
    const input = document.querySelector<HTMLInputElement>(
      "[data-xhd-managed-schedule='true']",
    )!;
    expect(input.dataset.xhdExpectedValue).toBe(prepared.value);
    input.value = prepared.value!;
    await expect(adapter.verifySchedule()).resolves.toEqual({
      ok: true,
      message: "官方定时时间已回读确认",
    });
  });

  it("聚焦封闭影子根内的真实发布按钮", async () => {
    const control = document.createElement("xhs-publish-btn");
    control.setAttribute("is-publish", "true");
    control.setAttribute("submit-disabled", "false");
    control.setAttribute("submit-loading", "false");
    control.setAttribute("submit-text", "发布");
    const root = control.attachShadow({ mode: "closed" });
    const button = document.createElement("button");
    button.textContent = "发布";
    button.scrollIntoView = vi.fn();
    const clicked = vi.spyOn(button, "click");
    root.append(button);
    document.body.append(control);

    await expect(adapter.preparePublish()).resolves.toMatchObject({
      ok: true,
      action: "activate_focused",
    });
    expect(root.activeElement).toBe(button);
    expect(clicked).not.toHaveBeenCalled();
  });

  it("返回固定发布结果且拒绝无效素材组合", async () => {
    document.body.innerHTML = `
      <div role="alert">发布失败：合成标题包含页面原文</div>
    `;
    expect(adapter.observeOutcome()).toEqual({
      ok: true,
      state: "failed",
      message: "创作平台明确报告发布失败",
      resultUrl: undefined,
    });
    const invalid = createTask({ mediaKind: "mixed" });

    await expect(adapter.prepareUpload(invalid)).resolves.toEqual({
      ok: false,
      message: "创作页素材入口准备失败",
    });
  });

  it("把页面安全验证映射为可恢复步骤", async () => {
    document.body.innerHTML = `
      <div role="dialog">请完成安全验证后继续</div>
    `;
    const task = createTask();

    await expect(adapter.prepareUpload(task)).resolves.toEqual({
      ok: false,
      message: "创作平台要求完成安全验证",
      verification: true,
    });
    expect(adapter.observeOutcome()).toEqual({
      ok: true,
      state: "awaiting_verification",
      message: "创作平台要求完成安全验证",
    });
  });

  it("拒绝超出受管边界的发布任务", async () => {
    installImageForm(false);

    // 受管发布只做仅自己可见、无商品绑定的任务，越界一律在准备阶段拒绝。
    await expect(
      adapter.prepareUpload(createTask({ visibility: "public" })),
    ).resolves.toEqual({
      ok: false,
      message: "创作页素材入口准备失败",
    });
    await expect(
      adapter.prepareUpload(createTask({ withProduct: true })),
    ).resolves.toEqual({
      ok: false,
      message: "创作页素材入口准备失败",
    });
    await expect(
      adapter.prepareUpload(createTask({ targetDriver: "extension" })),
    ).resolves.toEqual({
      ok: false,
      message: "创作页素材入口准备失败",
    });
    await expect(
      adapter.prepareUpload(createTask({ assetCount: 0 })),
    ).resolves.toEqual({
      ok: false,
      message: "创作页素材入口准备失败",
    });
    await expect(
      adapter.prepareUpload(createTask({ assetCount: 19 })),
    ).resolves.toEqual({
      ok: false,
      message: "创作页素材入口准备失败",
    });
    await expect(
      adapter.prepareUpload(
        createTask({ mediaKind: "video", isOriginal: true }),
      ),
    ).resolves.toEqual({
      ok: false,
      message: "创作页素材入口准备失败",
    });
  });

  it("表单缺失时各步骤返回固定失败文案", async () => {
    // 等待素材与发布按钮的超时长达一到两分钟，用假计时器直接推进到超时。
    vi.useFakeTimers();
    try {
      const task = createTask();

      const filling = adapter.fill(task);
      await vi.advanceTimersByTimeAsync(130_000);
      await expect(filling).resolves.toEqual({
        ok: false,
        message: "创作页内容填充失败",
      });

      await expect(adapter.verifySchedule()).resolves.toEqual({
        ok: false,
        message: "官方定时时间未能确认",
      });

      const publishing = adapter.preparePublish();
      await vi.advanceTimersByTimeAsync(100_000);
      await expect(publishing).resolves.toEqual({
        ok: false,
        message: "发布按钮未能确认",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("步骤执行中出现安全验证时优先返回可恢复结果", async () => {
    const task = createTask();
    document.body.innerHTML = `<div role="dialog">请完成安全验证后继续</div>`;

    await expect(adapter.fill(task)).resolves.toEqual({
      ok: false,
      message: "创作平台要求完成安全验证",
      verification: true,
    });
    await expect(adapter.verifySchedule()).resolves.toEqual({
      ok: false,
      message: "创作平台要求完成安全验证",
      verification: true,
    });
    await expect(adapter.preparePublish()).resolves.toEqual({
      ok: false,
      message: "创作平台要求完成安全验证",
      verification: true,
    });
  });

  it("定时目标值丢失时拒绝确认", async () => {
    document.body.innerHTML = `
      <input data-xhd-managed-schedule="true" />
    `;

    await expect(adapter.verifySchedule()).resolves.toEqual({
      ok: false,
      message: "官方定时时间未能确认",
    });
  });

  it("发布成功后仅在帖子详情页回传结果地址", () => {
    document.body.innerHTML = `<div role="alert">发布成功：合成标题</div>`;

    setLocation("https://www.xiaohongshu.com", "/explore/synthetic123");
    expect(adapter.observeOutcome()).toMatchObject({
      state: "published",
      resultUrl: "https://www.xiaohongshu.com/explore/synthetic123",
    });

    setLocation("https://www.xiaohongshu.com", "/discovery/item/synthetic123");
    expect(adapter.observeOutcome()).toMatchObject({
      state: "published",
      resultUrl: "https://www.xiaohongshu.com/discovery/item/synthetic123",
    });

    // 仍停留在创作中心时没有可回传的公开地址。
    setLocation("https://creator.xiaohongshu.com", "/publish/publish");
    expect(adapter.observeOutcome()).toMatchObject({
      state: "published",
      resultUrl: undefined,
    });

    // 域名相符但路径不是帖子详情，同样不能回传。
    setLocation("https://www.xiaohongshu.com", "/user/profile/synthetic");
    expect(adapter.observeOutcome()).toMatchObject({
      state: "published",
      resultUrl: undefined,
    });
  });
});

function setLocation(origin: string, pathname: string): void {
  const url = new URL(`${origin}${pathname}`);
  vi.spyOn(window, "location", "get").mockReturnValue({
    ...window.location,
    hostname: url.hostname,
    pathname: url.pathname,
    href: url.href,
  } as Location);
}

function installImageForm(withOriginal: boolean): void {
  installBaseForm("image");
  if (!withOriginal) return;
  document.body.insertAdjacentHTML(
    "beforeend",
    `
      <div class="custom-switch-card">
        <span>原创声明</span>
        <div class="d-switch"><input type="checkbox" /></div>
      </div>
    `,
  );
  const toggle = document.querySelector<HTMLElement>(
    ".custom-switch-card .d-switch",
  )!;
  const state = toggle.querySelector<HTMLInputElement>("input")!;
  toggle.addEventListener("click", () => {
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    dialog.innerHTML = `
      <input type="checkbox" />
      <button>声明原创</button>
    `;
    dialog.querySelector("button")?.addEventListener("click", () => {
      state.checked = true;
    });
    document.body.append(dialog);
  });
}

function installBaseForm(kind: "image" | "video"): void {
  document.body.innerHTML = `
    <button>上传${kind === "image" ? "图文" : "视频"}</button>
    <input type="file" accept="${kind}/*" />
    <input placeholder="标题" />
    <div class="ProseMirror" contenteditable="true"></div>
    <div class="permission-card-wrapper">
      <div class="d-select-content">仅自己可见</div>
    </div>
  `;
}

function addNativePublishButton(): HTMLButtonElement {
  const button = document.createElement("button");
  button.textContent = "发布";
  document.body.append(button);
  return button;
}

function createTask(
  options: {
    mediaKind?: "image" | "video" | "mixed";
    isOriginal?: boolean;
    mode?: PublicationTask["mode"];
    visibility?: PublicationTask["package"]["visibility"];
    withProduct?: boolean;
    targetDriver?: PublicationTask["target_driver"];
    assetCount?: number;
  } = {},
): PublicationTask {
  const mediaKind = options.mediaKind ?? "image";
  const assets =
    mediaKind === "mixed"
      ? [createAsset("image", 0), createAsset("video", 1)]
      : options.assetCount !== undefined
        ? Array.from({ length: options.assetCount }, (_, index) =>
            createAsset(mediaKind, index),
          )
        : [createAsset(mediaKind, 0)];
  const timestamp = "2026-07-25T12:34:00.000Z";
  return {
    task_id: "synthetic-task",
    package: {
      draft_id: "synthetic-draft",
      title: "合成标题",
      body: "合成正文",
      tags: ["合成标签"],
      visibility: options.visibility ?? "private",
      is_original: options.isOriginal ?? false,
      products: options.withProduct ? ["合成商品"] : [],
      assets,
      created_at: timestamp,
      updated_at: timestamp,
    },
    package_fingerprint: "a".repeat(64),
    mode: options.mode ?? "manual",
    target_driver: options.targetDriver ?? "managed",
    status: "filling",
    scheduled_at: timestamp,
    attempts: 1,
    message: "合成任务",
    publish_attempted: false,
    created_at: timestamp,
    updated_at: timestamp,
  };
}

function createAsset(
  kind: "image" | "video",
  position: number,
): PublicationAsset {
  return {
    asset_id: `synthetic-${kind}-${position}`,
    filename: `synthetic-${position}.${kind === "image" ? "png" : "mp4"}`,
    media_type: `${kind}/*`,
    size: 1,
    sha256: "b".repeat(64),
    position,
  };
}
