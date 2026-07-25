/**
 * 搜索并绑定用户已明确确认的商品；歧义结果会中止发布。
 */
export async function bindConfirmedProducts(
  root: ParentNode,
  products: string[],
  timeout = 15_000,
): Promise<void> {
  if (products.length === 0) return;
  const trigger = findAddProductTrigger(root);
  if (!trigger) throw new Error("没有找到添加商品入口，账号可能未开通商品功能");
  trigger.click();
  const modal = await waitForValue(
    () =>
      root.querySelector<HTMLElement>(".multi-goods-selector-modal") ??
      undefined,
    timeout,
    "商品选择窗口未能打开",
  );
  for (const product of products) {
    await selectUniqueProduct(modal, product, timeout);
  }
  const save = findButton(modal, "保存");
  if (!save) throw new Error("商品选择窗口没有可用的保存按钮");
  save.click();
  await waitForValue(
    () => (!modal.isConnected || !isVisible(modal) ? true : undefined),
    timeout,
    "商品绑定结果未能确认",
  );
}

async function selectUniqueProduct(
  modal: HTMLElement,
  keyword: string,
  timeout: number,
): Promise<void> {
  const input = modal.querySelector<HTMLInputElement>(
    "input[placeholder*='搜索商品']",
  );
  if (!input) throw new Error("商品选择窗口没有搜索框");
  setInputValue(input, keyword);
  input.dispatchEvent(
    new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }),
  );
  input.dispatchEvent(
    new KeyboardEvent("keyup", { bubbles: true, key: "Enter" }),
  );
  const expected = normalize(keyword);
  const matches = await waitForValue(
    () => {
      if (isLoading(modal)) return undefined;
      const current = [
        ...modal.querySelectorAll<HTMLElement>(
          ".goods-list-normal .good-card-container",
        ),
      ];
      const matching = current.filter((card) =>
        normalize(normalizedText(card)).includes(expected),
      );
      return matching.length > 0 ? matching : undefined;
    },
    timeout,
    `没有找到商品“${keyword}”`,
  );
  if (matches.length !== 1) {
    throw new Error(
      `商品“${keyword}”匹配到 ${matches.length} 个结果，请提供更精确的名称或 ID`,
    );
  }
  const checkbox = matches[0].querySelector<HTMLElement>(
    ".d-checkbox, input[type='checkbox']",
  );
  if (!checkbox) throw new Error(`商品“${keyword}”没有可用的选择框`);
  if (!readToggle(checkbox)) checkbox.click();
  await waitForValue(
    () => (readToggle(checkbox) ? true : undefined),
    timeout,
    `商品“${keyword}”未能确认选中`,
  );
}

function findAddProductTrigger(root: ParentNode): HTMLElement | undefined {
  const text = [
    ...root.querySelectorAll<HTMLElement>(
      "button, [role='button'], .d-button, span",
    ),
  ].find((item) => normalizedText(item) === "添加商品");
  return (
    text?.closest<HTMLElement>("button, [role='button'], .d-button") ?? text
  );
}

function findButton(root: ParentNode, label: string): HTMLElement | undefined {
  return [...root.querySelectorAll<HTMLElement>("button, [role='button']")].find(
    (item) => normalizedText(item) === label && !isDisabled(item),
  );
}

function readToggle(element: HTMLElement): boolean {
  const input =
    element instanceof HTMLInputElement
      ? element
      : element.querySelector<HTMLInputElement>("input[type='checkbox']");
  return Boolean(
    input?.checked ||
      element.getAttribute("aria-checked") === "true" ||
      element.classList.contains("checked") ||
      element.querySelector(".checked"),
  );
}

function setInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  setter?.call(input, value);
  input.dispatchEvent(new InputEvent("input", { bubbles: true, data: value }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function isLoading(root: ParentNode): boolean {
  const loading = root.querySelector<HTMLElement>(".goods-list-loading");
  return Boolean(loading && isVisible(loading));
}

function isVisible(element: HTMLElement): boolean {
  return (
    !element.hidden &&
    element.getAttribute("aria-hidden") !== "true" &&
    element.style.display !== "none" &&
    element.style.visibility !== "hidden"
  );
}

function isDisabled(element: HTMLElement): boolean {
  return (
    (element instanceof HTMLButtonElement && element.disabled) ||
    element.hasAttribute("disabled") ||
    element.getAttribute("aria-disabled") === "true" ||
    element.classList.contains("disabled")
  );
}

function normalize(value: string): string {
  return value.replace(/\s+/g, "").toLocaleLowerCase();
}

function normalizedText(element: HTMLElement): string {
  return (element.innerText || element.textContent || "").replace(/\s+/g, "");
}

async function waitForValue<T>(
  read: () => T | undefined,
  timeout: number,
  message: string,
): Promise<T> {
  const immediate = read();
  if (immediate !== undefined) return immediate;
  return new Promise<T>((resolve, reject) => {
    const observer = new MutationObserver(() => {
      const value = read();
      if (value === undefined) return;
      cleanup();
      resolve(value);
    });
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error(message));
    }, timeout);
    const cleanup = () => {
      window.clearTimeout(timer);
      observer.disconnect();
    };
    observer.observe(document.documentElement, {
      attributes: true,
      childList: true,
      subtree: true,
    });
  });
}
