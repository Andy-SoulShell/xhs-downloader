import { afterEach, describe, expect, it, vi } from "vitest";

import { applySearchFilters, hasCustomSearchFilters } from "./search-filters";

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("搜索筛选交互", () => {
  it("只把非默认字符串识别为自定义筛选", () => {
    expect(hasCustomSearchFilters({})).toBe(false);
    expect(hasCustomSearchFilters({ sort_by: "综合" })).toBe(false);
    expect(hasCustomSearchFilters({ sort_by: 1 })).toBe(false);
    expect(hasCustomSearchFilters({ sort_by: "最新" })).toBe(true);
  });

  it("按分组文本点击多个筛选项", async () => {
    document.body.innerHTML = `
      <div class="filter"></div>
      <div class="filter-panel">
        <div class="filters"><div class="tags">最新</div></div>
        <div class="filters"><div class="tags">视频</div></div>
        <div class="filters"><div class="tags">一天内</div></div>
        <div class="filters"><div class="tags">未看过</div></div>
        <div class="filters"><div class="tags">同城</div></div>
      </div>
    `;
    const clicks = [...document.querySelectorAll(".tags")].map(() => vi.fn());
    [...document.querySelectorAll(".tags")].forEach((item, index) =>
      item.addEventListener("click", clicks[index]),
    );
    vi.useFakeTimers();
    const operation = applySearchFilters(document, {
      sort_by: "最新",
      note_type: "视频",
      publish_time: "一天内",
      search_scope: "未看过",
      location: "同城",
    });
    await vi.runAllTimersAsync();
    await operation;

    expect(clicks.every((click) => click.mock.calls.length === 1)).toBe(true);
  });

  it("兼容没有旧类名、仅通过可见文本暴露筛选项的页面", async () => {
    document.body.innerHTML = `
      <button><span>筛选</span></button>
      <section>
        <button>最新</button>
        <button>图文</button>
      </section>
    `;
    const latest = document.querySelectorAll("button")[1] as HTMLElement;
    const image = document.querySelectorAll("button")[2] as HTMLElement;
    const latestClick = vi.spyOn(latest, "click");
    const imageClick = vi.spyOn(image, "click");
    vi.useFakeTimers();

    const operation = applySearchFilters(document, {
      sort_by: "最新",
      note_type: "图文",
    });
    await vi.runAllTimersAsync();
    await operation;

    expect(latestClick).toHaveBeenCalledOnce();
    expect(imageClick).toHaveBeenCalledOnce();
  });

  it("拒绝缺失入口和不存在的标签", async () => {
    await expect(applySearchFilters(document, { sort_by: "最新" })).rejects.toThrow("没有筛选入口");
    document.body.innerHTML = `
      <div class="filter"></div>
      <div class="filter-panel"><div class="filters"></div></div>
    `;
    await expect(applySearchFilters(document, { sort_by: "最新" })).rejects.toThrow("没有筛选选项");
  });

  it("筛选面板未出现时在有界等待后失败", async () => {
    document.body.innerHTML = '<div class="filter"></div>';
    vi.useFakeTimers();
    const operation = applySearchFilters(document, { sort_by: "最新" });
    const rejection = expect(operation).rejects.toThrow("筛选面板未能及时打开");
    await vi.runAllTimersAsync();
    await rejection;
  });

  it("兼容非 div 标签的筛选入口和面板", async () => {
    document.body.innerHTML = `
      <button class="filter">筛选</button>
      <section class="filter-panel">
        <button class="tags">最新</button>
      </section>
    `;
    const target = document.querySelector(".tags") as HTMLElement;
    const click = vi.spyOn(target, "click");
    vi.useFakeTimers();

    const operation = applySearchFilters(document, { sort_by: "最新" });
    await vi.runAllTimersAsync();
    await operation;

    expect(click).toHaveBeenCalledOnce();
  });
});
