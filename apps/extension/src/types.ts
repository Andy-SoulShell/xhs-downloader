import type {
  ClientDownloadRecord,
  DownloadMode,
} from "@xhs-downloader/contracts";

/** 浏览器扩展和服务端共享的下载记录与执行模式。 */
export type { ClientDownloadRecord, DownloadMode };

export type DownloadPreference = "auto" | "browser" | "background";
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

export interface ExtensionState {
  mode: DownloadPreference;
  online: boolean;
  pendingRecords: number;
}

export type ExtensionRequest =
  | { type: "get-state" }
  | { type: "resolve-work"; sourceUrl: string }
  | { type: "set-mode"; mode: DownloadPreference }
  | { type: "download"; work: ExtensionWork; indexes: number[] }
  | { type: "sync-records" };

export interface ExtensionResponse {
  ok: boolean;
  message: string;
  mode?: DownloadMode;
  state?: ExtensionState;
  work?: ExtensionWork;
}
