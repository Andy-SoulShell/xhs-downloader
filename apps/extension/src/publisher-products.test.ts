import { beforeEach, describe, expect, it } from "vitest";

import { bindConfirmedProducts } from "./publisher-products";

beforeEach(() => {
  document.body.innerHTML = "";
});

function installProductDialog(names: string[]): void {
  document.body.innerHTML = `<button id="add">添加商品</button>`;
  document.querySelector("#add")?.addEventListener("click", () => {
    const modal = document.createElement("div");
    modal.className = "multi-goods-selector-modal";
    modal.innerHTML = `
      <input placeholder="搜索商品ID 或 商品名称" />
      <div class="goods-list-normal">
        ${names
          .map(
            (name) => `
              <div class="good-card-container">
                <span>${name}</span>
                <input class="d-checkbox" type="checkbox" />
              </div>
            `,
          )
          .join("")}
      </div>
      <button id="save">保存</button>
    `;
    modal.querySelector("#save")?.addEventListener("click", () => modal.remove());
    document.body.append(modal);
  });
}

describe("商品绑定", () => {
  it("没有商品时不触碰页面", async () => {
    await expect(bindConfirmedProducts(document, [], 100)).resolves.toBeUndefined();
  });

  it("只绑定唯一匹配且等待保存结果", async () => {
    installProductDialog(["合成防晒霜 SPF50", "合成面膜"]);

    await bindConfirmedProducts(document, ["防晒霜 SPF50"], 100);

    expect(document.querySelector(".multi-goods-selector-modal")).toBeNull();
  });

  it("有多个匹配项时中止，避免绑定错误商品", async () => {
    installProductDialog(["合成面膜 A", "合成面膜 B"]);

    await expect(bindConfirmedProducts(document, ["合成面膜"], 100)).rejects.toThrow(
      "匹配到 2 个结果",
    );
  });

  it("唯一商品缺少选择框时中止", async () => {
    document.body.innerHTML = `<button id="add">添加商品</button>`;
    document.querySelector("#add")?.addEventListener("click", () => {
      document.body.insertAdjacentHTML(
        "beforeend",
        `
          <div class="multi-goods-selector-modal">
            <input placeholder="搜索商品名称" />
            <div class="goods-list-normal">
              <div class="good-card-container">唯一合成商品</div>
            </div>
            <button>保存</button>
          </div>
        `,
      );
    });

    await expect(bindConfirmedProducts(document, ["唯一合成商品"], 100)).rejects.toThrow(
      "没有可用的选择框",
    );
  });

  it("商品窗口缺少搜索框或保存按钮时中止", async () => {
    document.body.innerHTML = `<button id="add">添加商品</button>`;
    document.querySelector("#add")?.addEventListener("click", () => {
      document.body.insertAdjacentHTML(
        "beforeend",
        `<div class="multi-goods-selector-modal"></div>`,
      );
    });
    await expect(bindConfirmedProducts(document, ["合成商品"], 100)).rejects.toThrow(
      "商品选择窗口没有搜索框",
    );

    document.querySelector(".multi-goods-selector-modal")?.remove();
    document.querySelector("#add")?.replaceWith(document.querySelector("#add")!.cloneNode(true));
    const add = document.querySelector("#add");
    add?.addEventListener("click", () => {
      document.body.insertAdjacentHTML(
        "beforeend",
        `
          <div class="multi-goods-selector-modal">
            <input placeholder="搜索商品名称" />
            <div class="goods-list-normal">
              <div class="good-card-container">
                合成商品
                <input type="checkbox" checked />
              </div>
            </div>
          </div>
        `,
      );
    });
    await expect(bindConfirmedProducts(document, ["合成商品"], 100)).rejects.toThrow(
      "没有可用的保存按钮",
    );
  });

  it("等待商品加载完成后再选择", async () => {
    document.body.innerHTML = `<button id="add">添加商品</button>`;
    document.querySelector("#add")?.addEventListener("click", () => {
      const modal = document.createElement("div");
      modal.className = "multi-goods-selector-modal";
      modal.innerHTML = `
        <input placeholder="搜索商品名称" />
        <div class="goods-list-loading">加载中</div>
        <div class="goods-list-normal">
          <div class="good-card-container">
            合成商品
            <input type="checkbox" />
          </div>
        </div>
        <button>保存</button>
      `;
      modal.querySelector("button")?.addEventListener("click", () => {
        modal.style.display = "none";
      });
      document.body.append(modal);
      window.setTimeout(() => {
        modal.querySelector<HTMLElement>(".goods-list-loading")!.hidden = true;
      }, 0);
    });

    await expect(bindConfirmedProducts(document, ["合成商品"], 100)).resolves.toBeUndefined();
  });

  it("商品窗口未出现时超时退出", async () => {
    document.body.innerHTML = `<button>添加商品</button>`;

    await expect(bindConfirmedProducts(document, ["合成商品"], 1)).rejects.toThrow(
      "商品选择窗口未能打开",
    );
  });

  it("账号没有商品入口时返回明确原因", async () => {
    await expect(bindConfirmedProducts(document, ["合成商品"], 100)).rejects.toThrow(
      "账号可能未开通商品功能",
    );
  });
});
