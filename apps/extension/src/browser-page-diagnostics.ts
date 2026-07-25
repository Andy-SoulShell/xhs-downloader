import type { JsonValue } from "@xhs-downloader/contracts";

const ADAPTER_VERSION = "xhs-web-2026.07";
const COMMON_ANCHORS = {
  initial_state: "script",
  main_container: ".main-container",
};
const PAGE_ANCHORS: Record<string, Record<string, string>> = {
  home: {
    feed_container: ".feeds-container, [class*='feeds-container']",
  },
  search: {
    filter_control: ".filter, [class*='filter']",
    feed_container: ".feeds-container, [class*='feeds-container']",
  },
  feed_detail: {
    comment_container: ".comments-container",
    detail_container: ".note-detail-mask, [class*='note-detail']",
  },
  profile: {
    profile_container: ".user-page, [class*='user-page']",
  },
};

/** 生成不含页面文本、账号、URL 参数和 DOM 原文的兼容性诊断。 */
export function buildPageCompatibilityDiagnostics(
  page: Document,
  pageUrl: string,
): Record<string, JsonValue> {
  const pageKind = classifyPage(pageUrl);
  const expected = {
    ...COMMON_ANCHORS,
    ...(PAGE_ANCHORS[pageKind] ?? {}),
  };
  const matched = Object.entries(expected)
    .filter(([name, selector]) =>
      name === "initial_state"
        ? hasInitialStateScript(page)
        : Boolean(page.querySelector(selector)),
    )
    .map(([name]) => name);
  const missing = Object.keys(expected).filter(
    (name) => !matched.includes(name),
  );
  return {
    adapter_version: ADAPTER_VERSION,
    selector_profile: detectSelectorProfile(page),
    page_kind: pageKind,
    matched_anchors: matched,
    missing_anchors: missing,
  };
}

function classifyPage(value: string): string {
  try {
    const pathname = new URL(value).pathname;
    if (pathname.startsWith("/search_result")) return "search";
    if (pathname.startsWith("/user/profile/")) return "profile";
    if (
      pathname.startsWith("/explore/") ||
      pathname.startsWith("/discovery/item/")
    ) {
      return "feed_detail";
    }
    if (pathname === "/" || pathname.startsWith("/explore")) return "home";
  } catch {
    return "unknown";
  }
  return "unknown";
}

function detectSelectorProfile(page: Document): string {
  if (hasInitialStateScript(page)) return "initial-state-v1";
  if (page.querySelector(".main-container, #global")) return "semantic-dom-v1";
  return "unknown";
}

function hasInitialStateScript(page: Document): boolean {
  return [...page.scripts].some((script) =>
    script.textContent?.includes("__INITIAL_STATE__"),
  );
}
