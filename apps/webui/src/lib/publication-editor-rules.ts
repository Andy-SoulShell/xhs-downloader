import type {
  PublicationDraft,
  PublicationDraftInput,
  PublicationMode,
  PublicationTask,
} from "./publication";
import type { BrowserDriver } from "./types";
import { isBrowserDriver } from "./types";
import { UserFacingError } from "./error-message";

/** 把待绑定商品文本规范化为去重且有界的商品列表。 */
export function normalizePublicationProducts(value: string): string[] {
  return [...new Set(value.split(/[\n,，]+/).map((item) => item.trim()))]
    .filter(Boolean)
    .slice(0, 20);
}

/** 按提交瞬间选定的连接方式收紧软件自带浏览器首期发布能力。 */
export function preparePublicationSubmission(
  input: PublicationDraftInput,
  driver: BrowserDriver,
): PublicationDraftInput {
  return driver === "managed" ? { ...input, visibility: "private", products: [] } : input;
}

/**
 * 列出当前还挡着发布的问题。
 *
 * 渲染期就要知道能不能发，才能把按钮停用并说清缺什么。此前校验只在点完
 * “确认发布”之后才跑，新用户第一次进来必然经历“被吓唬 → 确认 → 收到一句
 * 请至少添加一个发布素材”，用完一次就学会无脑点确认，真正不可逆的那一次
 * 也就没了保护。
 *
 * @param input 当前编辑中的草稿内容。
 * @param draft 草稿本体，用于读取素材。
 * @returns 面向用户的问题描述；可以发布时为空数组。
 */
export function publicationBlockers(
  input: PublicationDraftInput,
  draft: PublicationDraft,
): string[] {
  const blockers: string[] = [];
  if (!input.title && !input.body) blockers.push("标题和正文不能同时为空");
  if (!draft.assets.length) blockers.push("请至少添加一个发布素材");
  return blockers;
}

/** 为扩展任务生成只包含任务标识和媒体类型的官方创作页地址。 */
export function publicationCreatorUrl(task: PublicationTask): string {
  const url = new URL("https://creator.xiaohongshu.com/publish/publish");
  url.searchParams.set("xhd_task", task.task_id);
  if (task.package.assets[0]?.media_type.startsWith("video/")) {
    url.searchParams.set("target", "video");
  }
  return url.toString();
}

/** 校验发布任务冻结的连接方式；未知值直接拒绝，禁止猜测为扩展。 */
export function requirePublicationDriver(driver: unknown): BrowserDriver {
  if (!isBrowserDriver(driver)) {
    throw new UserFacingError("发布任务返回了不支持的连接方式");
  }
  return driver;
}

/** 返回已确认发布方式的用户文案。 */
export function publicationDriverLabel(driver: unknown): string {
  return requirePublicationDriver(driver) === "managed" ? "软件自带浏览器" : "浏览器扩展";
}

/** 校验并转换本地定时或平台官方定时的目标时间。 */
export function validatePublicationSchedule(
  value: string,
  mode: Exclude<PublicationMode, "manual">,
): string {
  const instant = new Date(value);
  if (!value || !Number.isFinite(instant.getTime())) {
    throw new UserFacingError("请选择有效的计划发布时间");
  }
  const delay = instant.getTime() - Date.now();
  if (delay <= 0) throw new UserFacingError("计划发布时间必须晚于当前时间");
  if (mode === "platform_scheduled" && delay < 60 * 60_000) {
    throw new UserFacingError("官方定时发布时间必须至少在 1 小时后");
  }
  if (mode === "platform_scheduled" && delay > 14 * 24 * 60 * 60_000) {
    throw new UserFacingError("官方定时发布时间不能超过 14 天");
  }
  return instant.toISOString();
}
