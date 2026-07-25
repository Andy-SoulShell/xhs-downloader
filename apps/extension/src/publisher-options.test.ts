import { beforeEach, describe, expect, it } from "vitest";

import {
  setOriginalDeclaration,
  setPlatformSchedule,
  setPublicationVisibility,
} from "./publisher-options";

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("发布选项目标状态", () => {
  it("选择并核验可见范围", async () => {
    document.body.innerHTML = `
      <div class="permission-card-wrapper">
        <div class="d-select-content">公开可见</div>
      </div>
      <div class="d-options-wrapper">
        <button class="custom-option">仅自己可见</button>
      </div>
    `;
    const select = document.querySelector<HTMLElement>(".d-select-content")!;
    document.querySelector(".custom-option")?.addEventListener("click", () => {
      select.textContent = "仅自己可见";
    });

    await setPublicationVisibility(document, "private", 100);

    expect(select.textContent).toBe("仅自己可见");
  });

  it("可见范围已经符合目标时不重复操作", async () => {
    document.body.innerHTML = `
      <div class="permission-card-wrapper">
        <div class="d-select-content">公开可见</div>
      </div>
    `;

    await expect(
      setPublicationVisibility(document, "public", 100),
    ).resolves.toBeUndefined();
  });

  it("缺少可见范围控件时返回明确错误", async () => {
    await expect(
      setPublicationVisibility(document, "public", 1),
    ).rejects.toThrow("没有找到可见范围控件");
  });

  it("处理原创须知并确认开关状态", async () => {
    document.body.innerHTML = `
      <div class="custom-switch-card">
        <span>原创声明</span>
        <div class="d-switch"><input type="checkbox" /></div>
      </div>
    `;
    const toggle = document.querySelector<HTMLElement>(".d-switch")!;
    const state = toggle.querySelector<HTMLInputElement>("input")!;
    toggle.addEventListener("click", () => {
      const dialog = document.createElement("div");
      dialog.setAttribute("role", "dialog");
      dialog.innerHTML = `
        <span>原创声明须知</span>
        <input type="checkbox" />
        <button>声明原创</button>
      `;
      dialog.querySelector("button")?.addEventListener("click", () => {
        state.checked = true;
      });
      document.body.append(dialog);
    });

    await setOriginalDeclaration(document, true, 100);

    expect(state.checked).toBe(true);
    expect(
      document.querySelector<HTMLInputElement>("[role='dialog'] input")?.checked,
    ).toBe(true);
  });

  it("未请求原创时允许页面没有原创控件", async () => {
    await expect(
      setOriginalDeclaration(document, false, 10),
    ).resolves.toBeUndefined();
    await expect(setOriginalDeclaration(document, true, 10)).rejects.toThrow(
      "没有找到原创声明控件",
    );
  });

  it("关闭已经开启的原创声明并核验结果", async () => {
    document.body.innerHTML = `
      <div class="custom-switch-card">
        <span>原创声明</span>
        <div class="d-switch checked"></div>
      </div>
    `;
    const toggle = document.querySelector<HTMLElement>(".d-switch")!;
    toggle.addEventListener("click", () => toggle.classList.remove("checked"));

    await setOriginalDeclaration(document, false, 100);

    expect(toggle.classList.contains("checked")).toBe(false);
  });

  it("原创卡片结构变化时中止发布", async () => {
    document.body.innerHTML = `
      <div class="custom-switch-card"><span>原创声明</span></div>
    `;

    await expect(
      setOriginalDeclaration(document, true, 100),
    ).rejects.toThrow("原创声明控件结构已经变化");
  });

  it("开启官方定时并写入浏览器本地时间", async () => {
    document.body.innerHTML = `
      <div class="post-time-wrapper">
        <div class="d-switch"><input type="checkbox" /></div>
      </div>
      <div class="date-picker-container"><input /></div>
    `;
    const toggle = document.querySelector<HTMLElement>(".d-switch")!;
    const state = toggle.querySelector<HTMLInputElement>("input")!;
    toggle.addEventListener("click", () => {
      state.checked = true;
    });

    await setPlatformSchedule(document, "2026-07-25T12:34:00.000Z", 100);

    const expected = new Date("2026-07-25T12:34:00.000Z");
    const part = (value: number) => String(value).padStart(2, "0");
    expect(document.querySelector<HTMLInputElement>(".date-picker-container input")?.value)
      .toBe(
        `${expected.getFullYear()}-${part(expected.getMonth() + 1)}-${part(
          expected.getDate(),
        )} ${part(expected.getHours())}:${part(expected.getMinutes())}`,
      );
  });

  it("拒绝无效官方定时时间", async () => {
    await expect(
      setPlatformSchedule(document, "not-a-date", 100),
    ).rejects.toThrow("官方定时时间格式无效");
  });
});
