import type { JsonValue } from "@xhs-downloader/contracts";

const DEFAULT_FILTERS: Record<string, string> = {
  sort_by: "综合",
  note_type: "不限",
  publish_time: "不限",
  search_scope: "不限",
  location: "不限",
};
const FILTER_GROUPS = ["sort_by", "note_type", "publish_time", "search_scope", "location"];

/** 判断搜索任务是否要求操作筛选面板。 */
export function hasCustomSearchFilters(filters: Record<string, JsonValue>): boolean {
  return FILTER_GROUPS.some(
    (field) => typeof filters[field] === "string" && filters[field] !== DEFAULT_FILTERS[field],
  );
}

/** 在搜索页按服务端已验证的中文标签应用筛选条件。 */
export async function applySearchFilters(
  page: Document,
  filters: Record<string, JsonValue>,
): Promise<void> {
  const triggerCandidate =
    page.querySelector<HTMLElement>(".filter") ?? findExactTextElement(page, "筛选");
  const trigger =
    triggerCandidate?.closest<HTMLElement>("button, [role='button'], div.filter, div") ??
    triggerCandidate;
  if (!trigger) throw new Error("搜索页没有筛选入口");
  trigger.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
  trigger.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
  const scope = await waitForFilterOptions(page);
  for (const field of FILTER_GROUPS) {
    const wanted = filters[field];
    if (typeof wanted !== "string" || wanted === DEFAULT_FILTERS[field]) continue;
    const target =
      [...scope.querySelectorAll<HTMLElement>("div.tags")].find(
        (item) => item.textContent?.trim() === wanted,
      ) ?? findExactTextElement(scope, wanted);
    if (!target) throw new Error(`搜索页没有筛选选项 ${wanted}`);
    target.click();
    await delay(150);
  }
  await delay(350);
}

async function waitForFilterOptions(page: Document): Promise<ParentNode> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const panel = page.querySelector<HTMLElement>(".filter-panel");
    if (panel) return panel;
    if (findExactTextElement(page, "最新")) return page;
    await delay(100);
  }
  throw new Error("搜索筛选面板未能及时打开");
}

function findExactTextElement(scope: ParentNode, text: string): HTMLElement | null {
  const candidates = scope.querySelectorAll<HTMLElement>("button, [role='button'], div, span");
  return (
    [...candidates].find(
      (element) =>
        element.textContent?.trim() === text &&
        ![...element.children].some((child) => child.textContent?.trim() === text),
    ) ?? null
  );
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
