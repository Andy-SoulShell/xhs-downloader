import type { PublicationClaim, PublicationTask } from "./publication-types";

/** 创建仅用于扩展单元测试的合成发布租约。 */
export function makePublicationClaim(
  status: PublicationTask["status"] = "claimed",
  expiresAt = new Date(Date.now() + 60_000).toISOString(),
): PublicationClaim {
  return {
    task: {
      task_id: "task",
      package: {
        draft_id: "draft",
        title: "标题",
        body: "正文",
        tags: [],
        visibility: "public",
        is_original: false,
        products: [],
        assets: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      package_fingerprint: "a".repeat(64),
      mode: "manual",
      status,
      scheduled_at: new Date().toISOString(),
      extension_id: "extension",
      lease_expires_at: expiresAt,
      attempts: 1,
      message: "合成任务",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    lease_token: "lease",
  };
}
