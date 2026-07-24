export type PublicationMode = "manual" | "scheduled";
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

export interface PublicationDraftInput {
  title: string;
  body: string;
  tags: string[];
  asset_order?: string[];
}
