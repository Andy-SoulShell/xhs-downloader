export type PublicationMode = "manual" | "scheduled" | "platform_scheduled";
export type PublicationVisibility = "public" | "private" | "mutual";
export type PublicationTaskStatus =
  | "scheduled"
  | "ready"
  | "claimed"
  | "filling"
  | "publishing"
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
  extension_id?: string;
  lease_expires_at?: string;
  attempts: number;
  message: string;
  result_url?: string;
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

export function isPublicationRequest(
  request: { type?: string },
): request is PublicationRequest {
  return request.type?.startsWith("publication-") ?? false;
}
