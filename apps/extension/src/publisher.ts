import styles from "./publisher.css";
import { assemblePublicationFile } from "./publication-assets";
import {
  activateNativePublishControl,
  attachFiles,
  choosePublicationMode,
  fillPublicationForm,
  isCustomPublishControl,
  waitForPublishOutcome,
  waitForPublishControl,
  waitForUploadInput,
} from "./publisher-dom";
import { waitForMediaReady } from "./publisher-media";
import {
  setOriginalDeclaration,
  setPlatformSchedule,
  setPublicationVisibility,
} from "./publisher-options";
import { bindConfirmedProducts } from "./publisher-products";
import type {
  PublicationClaim,
  PublicationRequest,
  PublicationResponse,
  PublicationTaskStatus,
} from "./publication-types";

void runPublisher();

async function runPublisher(): Promise<void> {
  installStyles();
  const preferredTaskId =
    new URL(window.location.href).searchParams.get("xhd_task") ?? undefined;
  try {
    const prepared = await send({
      type: "publication-prepare",
      preferredTaskId,
    });
    if (!prepared.ok || !prepared.claim) {
      if (preferredTaskId) showStatus(prepared.message, "warning");
      return;
    }
    const claim = prepared.claim;
    if (isLoginPage()) {
      await report(
        claim,
        "needs_review",
        "创作平台尚未登录，请登录后在发布中心重试",
      );
      showStatus("需要先登录创作平台", "warning");
      return;
    }
    if (claim.task.status === "publishing") {
      await observeOutcome(claim);
      return;
    }
    if (!["claimed", "filling"].includes(claim.task.status)) return;
    await executePublication(claim);
  } catch (error) {
    showStatus(errorMessage(error), "warning");
  }
}

async function executePublication(claim: PublicationClaim): Promise<void> {
  try {
    showStatus("正在准备发布素材");
    await report(claim, "filling", "正在准备创作页和素材");
    const assets = [...claim.task.package.assets].sort(
      (left, right) => left.position - right.position,
    );
    const kind = assets[0]?.media_type.startsWith("video/")
      ? "video"
      : "image";
    choosePublicationMode(document, kind);
    const input = await waitForUploadInput(document, kind);
    const files = [];
    for (const asset of assets) {
      files.push(
        await assemblePublicationFile(asset, (assetId, offset) =>
          loadAssetChunk(claim, assetId, offset),
        ),
      );
    }
    attachFiles(input, files);
    showStatus(kind === "video" ? "正在等待视频处理完成" : "正在填写发布内容");
    await waitForMediaReady(document, kind);
    showStatus("正在填写标题和正文");
    const draft = claim.task.package;
    const body = [draft.body, ...draft.tags.map((tag) => `#${tag}`)]
      .filter(Boolean)
      .join("\n");
    await fillPublicationForm(document, draft.title, body);
    showStatus("正在核对发布选项");
    await setPublicationVisibility(document, draft.visibility);
    await setOriginalDeclaration(document, draft.is_original);
    await bindConfirmedProducts(document, draft.products);
    if (claim.task.mode === "platform_scheduled") {
      await setPlatformSchedule(document, claim.task.scheduled_at, {
        write: (value) => typePlatformSchedule(claim, value),
      });
    }
    const control = await waitForPublishControl(document);
    showStatus("正在提交到创作平台");
    await report(claim, "publishing", "即将点击创作平台发布按钮");
    if (isCustomPublishControl(control)) {
      const activation = await send({
        type: "publication-activate",
        taskId: claim.task.task_id,
        leaseToken: claim.lease_token,
      });
      if (!activation.ok) throw new Error(activation.message);
      await report(claim, "publishing", "已发送受控输入，等待平台确认");
    } else {
      activateNativePublishControl(control);
    }
    await observeOutcome(claim);
  } catch (error) {
    const message = errorMessage(error);
    await safelyReport(claim, "failed", message);
    showStatus(message, "warning");
  }
}

async function typePlatformSchedule(
  claim: PublicationClaim,
  value: string,
): Promise<void> {
  const response = await send({
    type: "publication-schedule-input",
    taskId: claim.task.task_id,
    leaseToken: claim.lease_token,
    value,
  });
  if (!response.ok) throw new Error(response.message);
}

async function observeOutcome(claim: PublicationClaim): Promise<void> {
  try {
    const outcome = await waitForPublishOutcome(
      document,
      () => window.location.pathname,
    );
    await report(
      claim,
      outcome.status,
      outcome.message,
      outcome.status === "published" ? publicResultUrl() : undefined,
    );
    showStatus(
      outcome.status === "published" ? "发布成功" : outcome.message,
      outcome.status === "published" ? "success" : "warning",
    );
  } catch {
    const message = "发布结果未能确认，请到创作平台检查，系统不会自动重试";
    await safelyReport(claim, "needs_review", message);
    showStatus(message, "warning");
  }
}

async function loadAssetChunk(
  claim: PublicationClaim,
  assetId: string,
  offset: number,
) {
  const response = await send({
    type: "publication-asset-chunk",
    taskId: claim.task.task_id,
    leaseToken: claim.lease_token,
    assetId,
    offset,
  });
  if (!response.ok || !response.chunk) throw new Error(response.message);
  return response.chunk;
}

async function report(
  claim: PublicationClaim,
  status: PublicationTaskStatus,
  message: string,
  resultUrl?: string,
): Promise<void> {
  const response = await send({
    type: "publication-status",
    taskId: claim.task.task_id,
    leaseToken: claim.lease_token,
    status,
    message,
    resultUrl,
  });
  if (!response.ok) throw new Error(response.message);
}

async function safelyReport(
  claim: PublicationClaim,
  status: PublicationTaskStatus,
  message: string,
): Promise<void> {
  try {
    await report(claim, status, message);
  } catch {
    // 原错误更有诊断价值；服务离线时租约会自行恢复或转为待确认。
  }
}

function send(request: PublicationRequest): Promise<PublicationResponse> {
  return chrome.runtime.sendMessage(request) as Promise<PublicationResponse>;
}

function isLoginPage(): boolean {
  return (
    window.location.pathname.includes("login") ||
    Boolean(document.querySelector("input[type='password']"))
  );
}

function publicResultUrl(): string | undefined {
  return window.location.hostname === "www.xiaohongshu.com"
    ? window.location.href
    : undefined;
}

function installStyles(): void {
  if (document.querySelector("style[data-xhd-publisher]")) return;
  const style = document.createElement("style");
  style.dataset.xhdPublisher = "";
  style.textContent = styles;
  document.documentElement.append(style);
}

function showStatus(
  message: string,
  tone: "default" | "success" | "warning" = "default",
): void {
  let element = document.querySelector<HTMLElement>("#xhd-publish-status");
  if (!element) {
    element = document.createElement("div");
    element.id = "xhd-publish-status";
    document.documentElement.append(element);
  }
  element.dataset.tone = tone;
  element.textContent = message;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "自动发布执行失败";
}
