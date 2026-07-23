import type {
  DownloadMode,
  DownloadPreference,
  ExtensionMedia,
} from "./types";

export function resolveDownloadMode(
  preference: DownloadPreference,
  serviceOnline: boolean,
): DownloadMode {
  if (preference === "auto") {
    return serviceOnline ? "background" : "browser";
  }
  return preference;
}

export function buildDownloadFilename(
  workId: string,
  media: ExtensionMedia,
): string {
  const safeWorkId = workId.replace(/[^A-Za-z0-9_-]/g, "_");
  const kindSuffix = media.kind === "live" ? "_live" : "";
  return `xhs-downloader/${safeWorkId}/${media.index}${kindSuffix}.${media.suffix}`;
}
