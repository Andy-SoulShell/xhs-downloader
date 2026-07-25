import {
  choosePublicationMode,
  fillPublicationForm,
  isCustomPublishControl,
  readPublishOutcome,
  waitForPublishControl,
  waitForUploadInput,
} from "./publisher-dom";
import { installPublisherBridge } from "./publisher-bridge";
import { waitForMediaReady } from "./publisher-media";
import {
  preparePlatformSchedule,
  setOriginalDeclaration,
  setPublicationVisibility,
  verifyPlatformSchedule,
} from "./publisher-options";
import { readPublicationVerification } from "./publisher-verification";
import type { PublicationTask } from "./publication-types";

const ADAPTER_GLOBAL = "__XHS_DOWNLOADER_MANAGED_PUBLISHER_ADAPTER__";
const UPLOAD_ATTRIBUTE = "data-xhd-managed-upload";
const SCHEDULE_ATTRIBUTE = "data-xhd-managed-schedule";
const PUBLISH_ATTRIBUTE = "data-xhd-managed-publish";
const UPLOAD_SELECTOR = `[${UPLOAD_ATTRIBUTE}='true']`;
const SCHEDULE_SELECTOR = `[${SCHEDULE_ATTRIBUTE}='true']`;
const PUBLISH_SELECTOR = `[${PUBLISH_ATTRIBUTE}='true']`;
const PUBLISH_CONTROL = Symbol.for("xhs-downloader.publisher-control");

interface StepResponse {
  ok: boolean;
  message: string;
  verification?: true;
  action?: "upload" | "type_schedule" | "click_selector" | "click_coordinates";
  mediaKind?: "image" | "video";
  selector?: string;
  value?: string;
  x?: number;
  y?: number;
  viewportWidth?: number;
  viewportHeight?: number;
}

interface Observation {
  ok: true;
  state: "pending" | "published" | "failed" | "awaiting_verification";
  message: string;
  resultUrl?: string;
}

interface ManagedPublisherAdapter {
  version: string;
  prepareUpload(task: PublicationTask): Promise<StepResponse>;
  fill(task: PublicationTask): Promise<StepResponse>;
  verifySchedule(): Promise<StepResponse>;
  preparePublish(): Promise<StepResponse>;
  observeOutcome(): Observation;
}

type AdapterScope = typeof globalThis & {
  __XHS_DOWNLOADER_MANAGED_PUBLISHER_ADAPTER__?: ManagedPublisherAdapter;
  [PUBLISH_CONTROL]?: () => {
    ok?: boolean;
    message?: string;
    x?: number;
    y?: number;
  };
};

/**
 * 安装不依赖扩展 API 的受管发布页面适配器。
 */
export function installManagedPublisherAdapter(): ManagedPublisherAdapter {
  const scope = globalThis as AdapterScope;
  if (scope[ADAPTER_GLOBAL]) return scope[ADAPTER_GLOBAL];
  installPublisherBridge();
  const adapter: ManagedPublisherAdapter = {
    version: "1",
    prepareUpload,
    fill,
    verifySchedule,
    preparePublish,
    observeOutcome,
  };
  scope[ADAPTER_GLOBAL] = adapter;
  return adapter;
}

async function prepareUpload(task: PublicationTask): Promise<StepResponse> {
  try {
    const verification = verificationStep();
    if (verification) return verification;
    const mediaKind = validateTask(task);
    choosePublicationMode(document, mediaKind);
    const input = await waitForUploadInput(document, mediaKind);
    clearMarker(UPLOAD_ATTRIBUTE);
    input.setAttribute(UPLOAD_ATTRIBUTE, "true");
    return {
      ok: true,
      message: "创作页素材入口已准备",
      action: "upload",
      mediaKind,
      selector: UPLOAD_SELECTOR,
    };
  } catch {
    const verification = verificationStep();
    if (verification) return verification;
    return failure("创作页素材入口准备失败");
  }
}

async function fill(task: PublicationTask): Promise<StepResponse> {
  try {
    const verification = verificationStep();
    if (verification) return verification;
    const mediaKind = validateTask(task);
    await waitForMediaReady(document, mediaKind);
    const draft = task.package;
    const body = [draft.body, ...draft.tags.map((tag) => `#${tag}`)]
      .filter(Boolean)
      .join("\n");
    await fillPublicationForm(document, draft.title, body);
    await setPublicationVisibility(document, "private");
    await setOriginalDeclaration(document, draft.is_original);
    const blocked = verificationStep();
    if (blocked) return blocked;
    if (task.mode !== "platform_scheduled") {
      return { ok: true, message: "创作页内容和发布选项已核验" };
    }
    const prepared = await preparePlatformSchedule(
      document,
      task.scheduled_at,
    );
    clearMarker(SCHEDULE_ATTRIBUTE);
    prepared.input.setAttribute(SCHEDULE_ATTRIBUTE, "true");
    prepared.input.dataset.xhdExpectedValue = prepared.value;
    return {
      ok: true,
      message: "官方定时输入已准备",
      action: "type_schedule",
      selector: SCHEDULE_SELECTOR,
      value: prepared.value,
    };
  } catch {
    const verification = verificationStep();
    if (verification) return verification;
    return failure("创作页内容填充失败");
  }
}

async function verifySchedule(): Promise<StepResponse> {
  try {
    const input = document.querySelector<HTMLInputElement>(SCHEDULE_SELECTOR);
    if (!input) throw new Error("官方定时输入框已经消失");
    const expected = input.dataset.xhdExpectedValue;
    if (!expected) throw new Error("官方定时目标值已经丢失");
    await verifyPlatformSchedule(input, expected);
    return { ok: true, message: "官方定时时间已回读确认" };
  } catch {
    const verification = verificationStep();
    if (verification) return verification;
    return failure("官方定时时间未能确认");
  }
}

async function preparePublish(): Promise<StepResponse> {
  try {
    const verification = verificationStep();
    if (verification) return verification;
    const control = await waitForPublishControl(document);
    if (!isCustomPublishControl(control)) {
      clearMarker(PUBLISH_ATTRIBUTE);
      control.setAttribute(PUBLISH_ATTRIBUTE, "true");
      return {
        ok: true,
        message: "原生发布按钮已核验",
        action: "click_selector",
        selector: PUBLISH_SELECTOR,
      };
    }
    const location = (globalThis as AdapterScope)[PUBLISH_CONTROL]?.();
    if (
      location?.ok !== true ||
      !Number.isFinite(location.x) ||
      !Number.isFinite(location.y)
    ) {
      throw new Error(location?.message || "无法定位创作平台发布按钮");
    }
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    if (
      viewportWidth <= 0 ||
      viewportHeight <= 0 ||
      location.x! < 0 ||
      location.y! < 0 ||
      location.x! >= viewportWidth ||
      location.y! >= viewportHeight
    ) {
      throw new Error("创作平台发布按钮坐标超出当前视口");
    }
    return {
      ok: true,
      message: "封闭发布按钮已核验",
      action: "click_coordinates",
      x: location.x,
      y: location.y,
      viewportWidth,
      viewportHeight,
    };
  } catch {
    const verification = verificationStep();
    if (verification) return verification;
    return failure("发布按钮未能确认");
  }
}

function observeOutcome(): Observation {
  const verification = readPublicationVerification(document);
  if (verification) {
    return {
      ok: true,
      state: "awaiting_verification",
      message: verification,
    };
  }
  const outcome = readPublishOutcome(document, window.location.pathname);
  if (!outcome) {
    return { ok: true, state: "pending", message: "等待创作平台确认" };
  }
  const resultUrl =
    outcome.status === "published" &&
    window.location.hostname === "www.xiaohongshu.com" &&
    /^\/(?:explore|discovery\/item)\/[a-z0-9]+\/?$/i.test(
      window.location.pathname,
    )
      ? `https://www.xiaohongshu.com${window.location.pathname}`
      : undefined;
  return {
    ok: true,
    state: outcome.status,
    message:
      outcome.status === "published"
        ? "创作平台已确认发布成功"
        : "创作平台明确报告发布失败",
    resultUrl,
  };
}

function validateTask(task: PublicationTask): "image" | "video" {
  if (task.target_driver !== "managed") throw new Error("发布任务驱动无效");
  if (task.package.visibility !== "private") {
    throw new Error("受管发布只支持仅自己可见");
  }
  if (task.package.products.length) throw new Error("受管发布不支持绑定商品");
  const assets = task.package.assets;
  if (!assets.length) throw new Error("发布任务没有素材");
  const videoAssets = assets.filter((asset) =>
    asset.media_type.startsWith("video/"),
  );
  const imageAssets = assets.filter((asset) =>
    asset.media_type.startsWith("image/"),
  );
  if (videoAssets.length) {
    if (videoAssets.length !== 1 || assets.length !== 1) {
      throw new Error("视频笔记素材组合无效");
    }
    if (task.package.is_original) {
      throw new Error("视频笔记暂不支持原创声明");
    }
    return "video";
  }
  if (imageAssets.length !== assets.length || assets.length > 18) {
    throw new Error("图文笔记素材组合无效");
  }
  return "image";
}

function verificationStep(): StepResponse | undefined {
  const message = readPublicationVerification(document);
  return message
    ? { ok: false, message, verification: true }
    : undefined;
}

function clearMarker(attribute: string): void {
  document
    .querySelectorAll(`[${attribute}]`)
    .forEach((element) => element.removeAttribute(attribute));
}

function failure(message: string): StepResponse {
  return {
    ok: false,
    message,
  };
}

installManagedPublisherAdapter();
