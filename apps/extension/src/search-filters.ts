import type { JsonValue } from "@xhs-downloader/contracts";

const DEFAULT_FILTERS: Record<string, string> = {
  sort_by: "综合",
  note_type: "不限",
  publish_time: "不限",
  search_scope: "不限",
  location: "不限",
};
const FILTER_GROUPS = [
  "sort_by",
  "note_type",
  "publish_time",
  "search_scope",
  "location",
];

/** 判断搜索任务是否要求操作筛选面板。 */
export function hasCustomSearchFilters(
  filters: Record<string, JsonValue>,
): boolean {
  return FILTER_GROUPS.some(
    (field) =>
      typeof filters[field] === "string" &&
      filters[field] !== DEFAULT_FILTERS[field],
  );
}

/** 在搜索页按服务端已验证的中文标签应用筛选条件。 */
export async function applySearchFilters(
  page: Document,
  filters: Record<string, JsonValue>,
): Promise<void> {
  const trigger = page.querySelector<HTMLElement>("div.filter");
  if (!trigger) throw new Error("搜索页没有筛选入口");
  trigger.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
  trigger.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
  const panel = await waitForElement(page, "div.filter-panel");
  const groups = [...panel.querySelectorAll<HTMLElement>("div.filters")];
  for (const [index, field] of FILTER_GROUPS.entries()) {
    const wanted = filters[field];
    if (typeof wanted !== "string" || wanted === DEFAULT_FILTERS[field]) continue;
    const tags = [...(groups[index]?.querySelectorAll<HTMLElement>("div.tags") ?? [])];
    const target = tags.find((item) => item.textContent?.trim() === wanted);
    if (!target) throw new Error(`搜索页没有筛选选项 ${wanted}`);
    target.click();
    await delay(150);
  }
  await delay(350);
}

async function waitForElement(
  page: Document,
  selector: string,
): Promise<HTMLElement> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const element = page.querySelector<HTMLElement>(selector);
    if (element) return element;
    await delay(50);
  }
  throw new Error("搜索筛选面板未能及时打开");
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
