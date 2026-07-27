export type PublicationMode = "manual" | "scheduled" | "platform_scheduled";
export type PublicationVisibility = "public" | "private" | "mutual";
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
  target_driver: "extension" | "managed";
  status: PublicationTaskStatus;
  scheduled_at: string;
  executor_id?: string;
  extension_id?: string;
  lease_expires_at?: string;
  attempts: number;
  message: string;
  result_url?: string;
  publish_attempted: boolean;
  created_at: string;
  updated_at: string;
}

export interface PublicationClaim {
  task: PublicationTask;
  lease_token: string;
}

export interface ExtensionCredential {
  extensionId: string;
  token: string;
  /** 区分同一扩展在不同浏览器中的安装实例；旧凭据可能没有。 */
  installationId?: string;
}

export interface PublicationAssetChunk {
  base64: string;
  offset: number;
  nextOffset: number;
  total: number;
  done: boolean;
}

export type PublicationRequest =
  | { type: "publication-prepare"; preferredTaskId?: string }
  | {
      type: "publication-activate";
      taskId: string;
      leaseToken: string;
    }
  | {
      type: "publication-schedule-input";
      taskId: string;
      leaseToken: string;
      value: string;
    }
  | {
      type: "publication-status";
      taskId: string;
      leaseToken: string;
      status: PublicationTaskStatus;
      message: string;
      resultUrl?: string;
    }
  | {
      type: "publication-asset-chunk";
      taskId: string;
      leaseToken: string;
      assetId: string;
      offset: number;
    };

export interface PublicationResponse {
  ok: boolean;
  message: string;
  claim?: PublicationClaim;
  chunk?: PublicationAssetChunk;
}

export function isPublicationRequest(request: { type?: string }): request is PublicationRequest {
  return request.type?.startsWith("publication-") ?? false;
}
