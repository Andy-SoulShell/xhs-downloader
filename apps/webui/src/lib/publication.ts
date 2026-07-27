import type { BrowserDriver } from "./types";

/** 发布执行方式：立即、本地到期执行或创作平台官方定时。 */
export type PublicationMode = "manual" | "scheduled" | "platform_scheduled";
/** 小红书作品的目标可见范围。 */
export type PublicationVisibility = "public" | "private" | "mutual";
/** 发布任务从排期、执行、人机验证到终态的完整状态。 */
export type PublicationTaskStatus =
  | "scheduled"
  | "ready"
  | "claimed"
  | "filling"
  | "publishing"
  | "awaiting_verification"
  | "published"
  | "needs_review"
  | "failed"
  | "canceled";

export interface PublicationAsset {
  asset_id: string;
  filename: string;
  media_type: string;
  size: number;
  sha256: string;
  position: number;
}

export interface PublicationDraft {
  draft_id: string;
  title: string;
  body: string;
  tags: string[];
  visibility: PublicationVisibility;
  is_original: boolean;
  products: string[];
  assets: PublicationAsset[];
  created_at: string;
  updated_at: string;
  /**
   * 当前内容的摘要，与任务冻结的 `package_fingerprint` 同源。
   *
   * 两者不同就说明这份草稿在那次提交之后又被改过，界面才能把"已发布"
   * 说成"已发布 · 内容已改动"。老版本服务端不下发这个字段。
   */
  content_fingerprint?: string;
}

/** 后端冻结执行驱动并持久化的发布任务快照。 */
export interface PublicationTask {
  task_id: string;
  package: PublicationDraft;
  package_fingerprint: string;
  mode: PublicationMode;
  target_driver: BrowserDriver;
  status: PublicationTaskStatus;
  scheduled_at: string;
  executor_id?: string | null;
  extension_id?: string | null;
  lease_expires_at?: string | null;
  attempts: number;
  message: string;
  result_url?: string | null;
  publish_attempted: boolean;
  created_at: string;
  updated_at: string;
}

/** 用户确认受管浏览器验证完成后，后端受理原页面恢复的结果。 */
export interface PublicationVerificationResumeResult {
  task_id: string;
  resumed: true;
  publish_attempted: boolean;
  message: string;
}

export interface PublicationDraftInput {
  title: string;
  body: string;
  tags: string[];
  visibility: PublicationVisibility;
  is_original: boolean;
  products: string[];
  asset_order?: string[];
}
