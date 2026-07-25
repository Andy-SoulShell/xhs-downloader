import type { PublicationVisibility } from "./publication-types";

const VISIBILITY_LABELS: Record<PublicationVisibility, string> = {
  public: "公开可见",
  private: "仅自己可见",
  mutual: "仅互关好友可见",
};

/**
 * 把可见范围设置并核验为草稿指定的目标状态。
 */
export async function setPublicationVisibility(
  root: ParentNode,
  visibility: PublicationVisibility,
  timeout = 10_000,
): Promise<void> {
  const target = VISIBILITY_LABELS[visibility];
  const select = await waitForElement<HTMLElement>(
    root,
    ".permission-card-wrapper .d-select-content",
    timeout,
    "没有找到可见范围控件",
  );
  if (normalizedText(select).includes(target)) return;
  select.click();
  const option = await waitForValue(
    () =>
      [...root.querySelectorAll<HTMLElement>(
        ".d-options-wrapper .custom-option, [role='option']",
      )].find((item) => normalizedText(item).includes(target)),
    timeout,
    `没有找到可见范围“${target}”`,
  );
  option.click();
  await waitForValue(
    () => {
      const current = root.querySelector<HTMLElement>(
        ".permission-card-wrapper .d-select-content",
      );
      return current && normalizedText(current).includes(target)
        ? true
        : undefined;
    },
    timeout,
    `可见范围未能确认设为“${target}”`,
  );
}

/**
 * 把原创声明开关设置并核验为目标状态。
 */
export async function setOriginalDeclaration(
  root: ParentNode,
  enabled: boolean,
  timeout = 10_000,
): Promise<void> {
  const card = findByText(
    root.querySelectorAll<HTMLElement>(".custom-switch-card"),
    "原创声明",
  );
  if (!card) {
    if (!enabled) return;
    throw new Error("没有找到原创声明控件");
  }
  const toggle = card.querySelector<HTMLElement>(".d-switch");
  if (!toggle) throw new Error("原创声明控件结构已经变化");
  if (readToggle(toggle) === enabled) return;
  toggle.click();
  if (enabled) await handleOriginalDialog(root, toggle, timeout);
  await waitForValue(
    () => (readToggle(toggle) === enabled ? true : undefined),
    timeout,
    `原创声明未能确认${enabled ? "开启" : "关闭"}`,
  );
}

/**
 * 设置并核验创作平台的官方定时发布时间。
 */
export async function setPlatformSchedule(
  root: ParentNode,
  scheduledAt: string,
  timeout = 10_000,
): Promise<void> {
  const date = new Date(scheduledAt);
  if (Number.isNaN(date.getTime())) throw new Error("官方定时时间格式无效");
  const toggle = await waitForElement<HTMLElement>(
    root,
    ".post-time-wrapper .d-switch",
    timeout,
    "没有找到官方定时发布控件",
  );
  if (!readToggle(toggle)) toggle.click();
  await waitForValue(
    () => (readToggle(toggle) ? true : undefined),
    timeout,
    "官方定时发布开关未能确认开启",
  );
  const input = await waitForElement<HTMLInputElement>(
    root,
    ".date-picker-container input",
    timeout,
    "没有找到官方定时发布时间输入框",
  );
  const value = formatLocalDateTime(date);
  setInputValue(input, value);
  input.dispatchEvent(new Event("blur", { bubbles: true }));
  await waitForValue(
    () => (input.value === value ? true : undefined),
    timeout,
    "官方定时发布时间未能确认",
  );
}

async function handleOriginalDialog(
  root: ParentNode,
  toggle: HTMLElement,
  timeout: number,
): Promise<void> {
  const outcome = await waitForValue(
    () => {
      if (readToggle(toggle)) return { confirmed: true };
      const footer = findByText(
        root.querySelectorAll<HTMLElement>("div.footer, [role='dialog']"),
        "声明原创",
      );
      return footer ? { confirmed: false, footer } : undefined;
    },
    timeout,
    "原创声明确认窗口未能打开",
  );
  if (outcome.confirmed || !outcome.footer) return;
  const checkbox = outcome.footer.querySelector<HTMLElement>(
    ".d-checkbox, input[type='checkbox']",
  );
  if (checkbox && !readToggle(checkbox)) checkbox.click();
  const confirm = await waitForValue(
    () => findButton(outcome.footer!, "声明原创"),
    timeout,
    "原创声明确认按钮不可用",
  );
  confirm.click();
}

function findButton(root: ParentNode, label: string): HTMLElement | undefined {
  return [...root.querySelectorAll<HTMLElement>("button, [role='button']")].find(
    (item) => normalizedText(item) === label && !isDisabled(item),
  );
}

function findByText(
  values: NodeListOf<HTMLElement>,
  text: string,
  exact = false,
): HTMLElement | undefined {
  return [...values].find((item) =>
    exact ? normalizedText(item) === text : normalizedText(item).includes(text),
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

function isDisabled(element: HTMLElement): boolean {
  return (
    (element instanceof HTMLButtonElement && element.disabled) ||
    element.hasAttribute("disabled") ||
    element.getAttribute("aria-disabled") === "true" ||
    element.classList.contains("disabled")
  );
}

function formatLocalDateTime(value: Date): string {
  const part = (number: number) => String(number).padStart(2, "0");
  return `${value.getFullYear()}-${part(value.getMonth() + 1)}-${part(
    value.getDate(),
  )} ${part(value.getHours())}:${part(value.getMinutes())}`;
}

function normalizedText(element: HTMLElement): string {
  return (element.innerText || element.textContent || "").replace(/\s+/g, "");
}

function waitForElement<T extends HTMLElement>(
  root: ParentNode,
  selector: string,
  timeout: number,
  message: string,
): Promise<T> {
  return waitForValue(() => root.querySelector<T>(selector) ?? undefined, timeout, message);
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
