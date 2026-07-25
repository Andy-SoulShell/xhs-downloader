import type {
  PublicationDraft,
  PublicationDraftInput,
  PublicationMode,
  PublicationTask,
} from "./publication";
import type { BrowserDriver } from "./types";
import { isBrowserDriver } from "./types";

/** 把用户输入的话题文本规范化为去重且有界的标签列表。 */
export function normalizePublicationTags(value: string): string[] {
  return [...new Set(value.split(/[\s,#，]+/).map((item) => item.trim()))]
    .filter(Boolean)
    .slice(0, 20);
}

/** 把待绑定商品文本规范化为去重且有界的商品列表。 */
export function normalizePublicationProducts(value: string): string[] {
  return [...new Set(value.split(/[\n,，]+/).map((item) => item.trim()))]
    .filter(Boolean)
    .slice(0, 20);
}

/** 按提交瞬间选定的执行器收紧受管浏览器首期发布能力。 */
export function preparePublicationSubmission(
  input: PublicationDraftInput,
  driver: BrowserDriver,
): PublicationDraftInput {
  return driver === "managed"
    ? { ...input, visibility: "private", products: [] }
    : input;
}

/** 校验草稿具备创建发布任务所需的最小内容和素材。 */
export function validatePublicationDraft(
  input: PublicationDraftInput,
  draft: PublicationDraft,
): void {
  if (!input.title && !input.body) {
    throw new Error("标题和正文不能同时为空");
  }
  if (!draft.assets.length) throw new Error("请至少添加一个发布素材");
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

/** 校验发布任务冻结的执行器；未知值直接拒绝，禁止猜测为扩展。 */
export function requirePublicationDriver(driver: unknown): BrowserDriver {
  if (!isBrowserDriver(driver)) {
    throw new Error("发布任务返回了不支持的浏览器执行器");
  }
  return driver;
}

/** 返回已确认发布执行器的用户文案。 */
export function publicationDriverLabel(driver: unknown): string {
  return requirePublicationDriver(driver) === "managed"
    ? "受管浏览器"
    : "浏览器扩展";
}

/** 校验并转换本地定时或平台官方定时的目标时间。 */
export function validatePublicationSchedule(
  value: string,
  mode: Exclude<PublicationMode, "manual">,
): string {
  const instant = new Date(value);
  if (!value || !Number.isFinite(instant.getTime())) {
    throw new Error("请选择有效的计划发布时间");
  }
  const delay = instant.getTime() - Date.now();
  if (delay <= 0) throw new Error("计划发布时间必须晚于当前时间");
  if (mode === "platform_scheduled" && delay < 60 * 60_000) {
    throw new Error("官方定时发布时间必须至少在 1 小时后");
  }
  if (mode === "platform_scheduled" && delay > 14 * 24 * 60 * 60_000) {
    throw new Error("官方定时发布时间不能超过 14 天");
  }
  return instant.toISOString();
}
