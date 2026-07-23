export type DownloadPreference = "auto" | "browser" | "background";
export type DownloadMode = Exclude<DownloadPreference, "auto">;
export type MediaKind = "image" | "live" | "video";

export interface ExtensionMedia {
  index: number;
  kind: MediaKind;
  url: string;
  suffix: string;
  previewUrl?: string;
}

export interface ExtensionWork {
  workId: string;
  sourceUrl: string;
  title: string;
  description: string;
  authorName: string;
  authorAvatar?: string;
  media: ExtensionMedia[];
}

export interface ExtensionSettings {
  mode: DownloadPreference;
  serviceUrl: string;
}

export interface ClientDownloadRecord {
  record_id: string;
  work_id: string;
  source_url: string;
  title: string;
  mode: DownloadMode;
  status: "completed" | "failed";
  media_indexes: number[];
  created_at: string;
  message: string;
}

export interface ExtensionState {
  mode: DownloadPreference;
  online: boolean;
  pendingRecords: number;
}

export type ExtensionRequest =
  | { type: "get-state" }
  | { type: "set-mode"; mode: DownloadPreference }
  | { type: "download"; work: ExtensionWork; indexes: number[] }
  | { type: "sync-records" };

export interface ExtensionResponse {
  ok: boolean;
  message: string;
  mode?: DownloadMode;
  state?: ExtensionState;
}
