import type { JsonValue } from "@xhs-downloader/contracts";

const ADAPTER_VERSIONS = new Set(["xhs-web-2026.07"]);
const MAX_ANCHOR_COUNT = 8;
const MAX_INSPECTED_ANCHORS = 16;
const SELECTOR_PROFILES = new Set(["initial-state-v1", "semantic-dom-v1", "unknown"]);
const PAGE_KINDS = new Set(["home", "search", "feed_detail", "profile", "unknown"]);
const SEMANTIC_ANCHORS = new Set([
  "initial_state",
  "main_container",
  "feed_container",
  "filter_control",
  "comment_container",
  "detail_container",
  "profile_container",
]);

/** 可在普通用户界面公开和复制的页面兼容性诊断。 */
export interface SafeBrowserTaskDiagnostics {
  adapter_version?: string;
  selector_profile?: string;
  page_kind?: string;
  matched_anchors: string[];
  missing_anchors: string[];
}

/** 从不可信任务结果中提取严格白名单诊断，忽略页面、URL 和用户数据。 */
export function safeBrowserTaskDiagnostics(
  result: Record<string, JsonValue> | null,
): SafeBrowserTaskDiagnostics | null {
  if (!result) return null;
  const adapterVersion = safeAdapterVersion(result.adapter_version);
  const selectorProfile = safeEnum(result.selector_profile, SELECTOR_PROFILES);
  const pageKind = safeEnum(result.page_kind, PAGE_KINDS);
  const matchedAnchors = safeAnchors(result.matched_anchors);
  const missingAnchors = safeAnchors(result.missing_anchors);
  if (
    !adapterVersion &&
    !selectorProfile &&
    !pageKind &&
    !matchedAnchors.length &&
    !missingAnchors.length
  ) {
    return null;
  }
  return {
    ...(adapterVersion ? { adapter_version: adapterVersion } : {}),
    ...(selectorProfile ? { selector_profile: selectorProfile } : {}),
    ...(pageKind ? { page_kind: pageKind } : {}),
    matched_anchors: matchedAnchors,
    missing_anchors: missingAnchors,
  };
}

/** 序列化公开诊断；输出不会包含任务结果中的其他字段。 */
export function serializeSafeBrowserTaskDiagnostics(
  diagnostics: SafeBrowserTaskDiagnostics,
): string {
  return JSON.stringify(diagnostics, null, 2);
}

function safeAdapterVersion(value: JsonValue | undefined): string | undefined {
  return safeEnum(value, ADAPTER_VERSIONS);
}

function safeEnum(value: JsonValue | undefined, allowed: ReadonlySet<string>): string | undefined {
  return typeof value === "string" && allowed.has(value) ? value : undefined;
}

function safeAnchors(value: JsonValue | undefined): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .slice(0, MAX_INSPECTED_ANCHORS)
        .filter((item): item is string => typeof item === "string" && SEMANTIC_ANCHORS.has(item)),
    ),
  ].slice(0, MAX_ANCHOR_COUNT);
}
