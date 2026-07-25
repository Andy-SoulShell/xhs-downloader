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
}

export interface PublicationTask {
  task_id: string;
  package: PublicationDraft;
  package_fingerprint: string;
  mode: PublicationMode;
  status: PublicationTaskStatus;
  scheduled_at: string;
  extension_id?: string | null;
  lease_expires_at?: string | null;
  attempts: number;
  message: string;
  result_url?: string | null;
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
