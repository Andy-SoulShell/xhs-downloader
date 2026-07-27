/* 由 apps/extension/build.mjs 生成，请勿手工修改。 */
"use strict";
(() => {
  // src/publisher-dom.ts
  var CUSTOM_PUBLISH_CONTROL = "xhs-publish-btn";
  var TITLE_SELECTORS = [
    "input[placeholder*='\u6807\u9898']",
    "textarea[placeholder*='\u6807\u9898']",
    "[contenteditable='true'][data-placeholder*='\u6807\u9898']"
  ];
  var BODY_SELECTORS = [
    "textarea[placeholder*='\u6B63\u6587']",
    "textarea[placeholder*='\u63CF\u8FF0']",
    "textarea[placeholder*='\u5185\u5BB9']",
    "[contenteditable='true'][data-placeholder*='\u6B63\u6587']",
    "[contenteditable='true'][data-placeholder*='\u63CF\u8FF0']",
    ".ProseMirror[contenteditable='true']",
    ".ql-editor[contenteditable='true']"
  ];
  function choosePublicationMode(root, kind) {
    const labels = kind === "video" ? ["\u4E0A\u4F20\u89C6\u9891", "\u89C6\u9891\u7B14\u8BB0"] : ["\u4E0A\u4F20\u56FE\u6587", "\u56FE\u6587\u7B14\u8BB0"];
    const candidates = root.querySelectorAll(
      "button, [role='tab'], [role='button'], [class*='tab'], [class*='upload']"
    );
    const target = [...candidates].find(
      (element) => labels.some((label) => normalizedText(element).includes(label))
    );
    target?.click();
  }
  async function waitForUploadInput(root, kind, timeout = 3e4) {
    return waitForValue(
      () => {
        const inputs = [...root.querySelectorAll("input[type=file]")];
        return inputs.find((input) => acceptsKind(input.accept, kind));
      },
      timeout,
      "\u6CA1\u6709\u627E\u5230\u521B\u4F5C\u9875\u7D20\u6750\u4E0A\u4F20\u5165\u53E3"
    );
  }
  async function fillPublicationForm(root, title, body, timeout = 6e4) {
    const titleEditor = await waitForValue(
      () => queryFirst(root, TITLE_SELECTORS),
      timeout,
      "\u7D20\u6750\u4E0A\u4F20\u540E\u6CA1\u6709\u627E\u5230\u6807\u9898\u8F93\u5165\u6846"
    );
    const bodyEditor = await waitForValue(
      () => queryFirst(root, BODY_SELECTORS),
      timeout,
      "\u7D20\u6750\u4E0A\u4F20\u540E\u6CA1\u6709\u627E\u5230\u6B63\u6587\u7F16\u8F91\u5668"
    );
    setEditorValue(titleEditor, title);
    setEditorValue(bodyEditor, body);
  }
  async function waitForPublishControl(root, timeout = 9e4) {
    return waitForValue(
      () => {
        const custom = root.querySelector(CUSTOM_PUBLISH_CONTROL);
        if (custom?.getAttribute("is-publish") === "true" && custom.getAttribute("submit-disabled") !== "true" && custom.getAttribute("submit-loading") !== "true") {
          return custom;
        }
        const buttons = [...root.querySelectorAll("button")];
        return buttons.find((button) => {
          const text = normalizedText(button);
          return !button.disabled && (text === "\u53D1\u5E03" || text === "\u53D1\u5E03\u7B14\u8BB0" || text === "\u7ACB\u5373\u53D1\u5E03");
        });
      },
      timeout,
      "\u6CA1\u6709\u627E\u5230\u53EF\u7528\u7684\u53D1\u5E03\u6309\u94AE"
    );
  }
  function isCustomPublishControl(control) {
    return control.localName === CUSTOM_PUBLISH_CONTROL;
  }
  function readPublishOutcome(root, pathname) {
    if (/success|published/i.test(pathname)) {
      return { status: "published", message: "\u521B\u4F5C\u5E73\u53F0\u5DF2\u786E\u8BA4\u53D1\u5E03\u6210\u529F" };
    }
    const notices = root.querySelectorAll(
      "[role='alert'], [role='status'], .toast, .message, .notification"
    );
    for (const notice of notices) {
      const text = normalizedText(notice);
      if (/发布成功|提交成功|作品已发布/.test(text)) {
        return { status: "published", message: text };
      }
      if (/发布失败|提交失败|请重试|发生错误/.test(text)) {
        return { status: "failed", message: text };
      }
    }
    return void 0;
  }
  function setEditorValue(element, value) {
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      const prototype = element instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
      setter?.call(element, value);
    } else {
      element.focus();
      element.textContent = value;
    }
    element.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        data: value,
        inputType: "insertText"
      })
    );
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }
  function queryFirst(root, selectors) {
    for (const selector of selectors) {
      const result = root.querySelector(selector);
      if (result) return result;
    }
    return void 0;
  }
  function acceptsKind(accept, kind) {
    const value = accept.toLowerCase();
    const extensions = kind === "video" ? [".mp4", ".mov", ".webm"] : [".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic", ".avif"];
    return !value || value.includes(`${kind}/`) || value.includes(kind) || extensions.some((extension) => value.includes(extension));
  }
  function normalizedText(element) {
    return (element.innerText || element.textContent || "").replace(/\s+/g, "");
  }
  async function waitForValue(read, timeout, timeoutMessage) {
    const immediate = read();
    if (immediate !== void 0) return immediate;
    return new Promise((resolve, reject) => {
      const observer = new MutationObserver(() => {
        const value = read();
        if (value === void 0) return;
        cleanup();
        resolve(value);
      });
      const timer = window.setTimeout(() => {
        cleanup();
        reject(new Error(timeoutMessage));
      }, timeout);
      const cleanup = () => {
        window.clearTimeout(timer);
        observer.disconnect();
      };
      observer.observe(document.documentElement, {
        attributes: true,
        childList: true,
        subtree: true
      });
    });
  }

  // src/publisher-bridge.ts
  var PUBLISH_CONTROL = "xhs-publish-btn";
  var BRIDGE = /* @__PURE__ */ Symbol.for("xhs-downloader.publisher-control");
  function installPublisherBridge() {
    const roots = /* @__PURE__ */ new WeakMap();
    const originalAttachShadow = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function(init) {
      const root = originalAttachShadow.call(this, init);
      if (this.localName === PUBLISH_CONTROL) roots.set(this, root);
      return root;
    };
    const scope = globalThis;
    const previous = scope[BRIDGE];
    scope[BRIDGE] = (action = "locate") => accessCapturedControl(roots, action);
    return () => {
      Element.prototype.attachShadow = originalAttachShadow;
      if (previous) scope[BRIDGE] = previous;
      else delete scope[BRIDGE];
    };
  }
  function accessCapturedControl(roots, action) {
    const control = document.querySelector(PUBLISH_CONTROL);
    if (control?.getAttribute("is-publish") !== "true") {
      return { ok: false, message: "\u521B\u4F5C\u5E73\u53F0\u53D1\u5E03\u63A7\u4EF6\u4E0D\u53EF\u7528" };
    }
    const submitting = control.getAttribute("submit-disabled") === "true" || control.getAttribute("submit-loading") === "true";
    if (submitting && action === "activate") {
      return { ok: true, message: "\u521B\u4F5C\u5E73\u53F0\u5DF2\u7ECF\u8FDB\u5165\u63D0\u4EA4\u72B6\u6001" };
    }
    if (submitting) return { ok: false, message: "\u521B\u4F5C\u5E73\u53F0\u53D1\u5E03\u63A7\u4EF6\u4E0D\u53EF\u7528" };
    const label = control.getAttribute("submit-text") || "\u53D1\u5E03";
    const button = [...roots.get(control)?.querySelectorAll("button") ?? []].find(
      (item) => !item.disabled && item.textContent?.trim() === label
    );
    if (!button) return { ok: false, message: "\u65E0\u6CD5\u8BBF\u95EE\u521B\u4F5C\u5E73\u53F0\u53D1\u5E03\u6309\u94AE" };
    if (action === "activate") {
      button.click();
      return { ok: true, message: "\u5DF2\u901A\u8FC7\u521B\u4F5C\u9875\u5185\u90E8\u6309\u94AE\u63D0\u4EA4\u53D1\u5E03" };
    }
    button.scrollIntoView({ block: "center", inline: "center" });
    button.focus({ preventScroll: true });
    if (action === "prepare") {
      return { ok: true, message: "\u521B\u4F5C\u5E73\u53F0\u53D1\u5E03\u6309\u94AE\u5DF2\u51C6\u5907" };
    }
    const rect = button.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return { ok: false, message: "\u521B\u4F5C\u5E73\u53F0\u53D1\u5E03\u6309\u94AE\u5F53\u524D\u4E0D\u53EF\u89C1" };
    }
    return {
      ok: true,
      message: "\u5DF2\u805A\u7126\u521B\u4F5C\u5E73\u53F0\u53D1\u5E03\u6309\u94AE",
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    };
  }

  // src/publisher-media.ts
  var STATUS_SELECTOR = [
    "[role='alert']",
    "[role='status']",
    "[class*='upload']",
    "[class*='progress']",
    "[class*='video']"
  ].join(",");
  var FORM_SELECTOR = [
    "input[placeholder*='\u6807\u9898']",
    "textarea[placeholder*='\u6807\u9898']",
    "[contenteditable='true'][data-placeholder*='\u6807\u9898']"
  ].join(",");
  var FAILURE_PATTERN = /上传失败|处理失败|转码失败|视频损坏|格式不支持/;
  var PENDING_PATTERN = /上传中|正在上传|处理中|正在处理|转码中|正在转码/;
  async function waitForMediaReady(root, kind, timeout = 10 * 6e4) {
    if (kind === "image") return;
    await waitForValue2(() => readMediaState(root), timeout);
  }
  function readMediaState(root) {
    const statuses = [...root.querySelectorAll(STATUS_SELECTOR)].filter(isVisible);
    const failure2 = statuses.map(normalizedText2).find((text) => FAILURE_PATTERN.test(text));
    if (failure2) throw new Error(`\u89C6\u9891\u7D20\u6750\u5904\u7406\u5931\u8D25\uFF1A${failure2}`);
    const pending = statuses.some((element) => PENDING_PATTERN.test(normalizedText2(element)));
    return root.querySelector(FORM_SELECTOR) && !pending ? true : void 0;
  }
  function isVisible(element) {
    return !element.hidden && element.getAttribute("aria-hidden") !== "true" && element.style.display !== "none" && element.style.visibility !== "hidden";
  }
  function normalizedText2(element) {
    return (element.innerText || element.textContent || "").replace(/\s+/g, "").slice(0, 200);
  }
  async function waitForValue2(read, timeout) {
    const immediate = read();
    if (immediate) return;
    return new Promise((resolve, reject) => {
      const observer = new MutationObserver(check);
      const timer = window.setTimeout(() => {
        cleanup();
        reject(new Error("\u89C6\u9891\u4E0A\u4F20\u6216\u5E73\u53F0\u5904\u7406\u8D85\u65F6\uFF0C\u8BF7\u5728\u521B\u4F5C\u5E73\u53F0\u6838\u5BF9\u7D20\u6750\u72B6\u6001"));
      }, timeout);
      function cleanup() {
        window.clearTimeout(timer);
        observer.disconnect();
      }
      function check() {
        try {
          if (!read()) return;
          cleanup();
          resolve();
        } catch (error) {
          cleanup();
          reject(error);
        }
      }
      observer.observe(document.documentElement, {
        attributes: true,
        childList: true,
        subtree: true
      });
    });
  }

  // src/managed-publisher-control.ts
  var PUBLISH_CONTROL2 = /* @__PURE__ */ Symbol.for("xhs-downloader.publisher-control");
  var PREPARED_MESSAGE = "\u521B\u4F5C\u5E73\u53F0\u53D1\u5E03\u6309\u94AE\u5DF2\u51C6\u5907";
  function prepareManagedPublishControl() {
    try {
      const result = globalThis[PUBLISH_CONTROL2]?.("prepare");
      if (result?.ok === true && result.message === PREPARED_MESSAGE) {
        return { ok: true, message: result.message };
      }
    } catch {
    }
    return { ok: false, message: "\u521B\u4F5C\u5E73\u53F0\u53D1\u5E03\u6309\u94AE\u672A\u80FD\u51C6\u5907" };
  }

  // src/publisher-options.ts
  var VISIBILITY_LABELS = {
    public: "\u516C\u5F00\u53EF\u89C1",
    private: "\u4EC5\u81EA\u5DF1\u53EF\u89C1",
    mutual: "\u4EC5\u4E92\u5173\u597D\u53CB\u53EF\u89C1"
  };
  async function setPublicationVisibility(root, visibility, timeout = 1e4) {
    const target = VISIBILITY_LABELS[visibility];
    const select = await waitForElement(
      root,
      ".permission-card-wrapper .d-select-content",
      timeout,
      "\u6CA1\u6709\u627E\u5230\u53EF\u89C1\u8303\u56F4\u63A7\u4EF6"
    );
    if (normalizedText3(select).includes(target)) return;
    select.click();
    const option = await waitForValue3(
      () => [
        ...root.querySelectorAll(".d-options-wrapper .custom-option, [role='option']")
      ].find((item) => normalizedText3(item).includes(target)),
      timeout,
      `\u6CA1\u6709\u627E\u5230\u53EF\u89C1\u8303\u56F4\u201C${target}\u201D`
    );
    option.click();
    await waitForValue3(
      () => {
        const current = root.querySelector(".permission-card-wrapper .d-select-content");
        return current && normalizedText3(current).includes(target) ? true : void 0;
      },
      timeout,
      `\u53EF\u89C1\u8303\u56F4\u672A\u80FD\u786E\u8BA4\u8BBE\u4E3A\u201C${target}\u201D`
    );
  }
  async function setOriginalDeclaration(root, enabled, timeout = 1e4) {
    const card = findByText(root.querySelectorAll(".custom-switch-card"), "\u539F\u521B\u58F0\u660E");
    if (!card) {
      if (!enabled) return;
      throw new Error("\u6CA1\u6709\u627E\u5230\u539F\u521B\u58F0\u660E\u63A7\u4EF6");
    }
    const toggle = card.querySelector(".d-switch");
    if (!toggle) throw new Error("\u539F\u521B\u58F0\u660E\u63A7\u4EF6\u7ED3\u6784\u5DF2\u7ECF\u53D8\u5316");
    if (readToggle(toggle) === enabled) return;
    toggle.click();
    if (enabled) await handleOriginalDialog(root, toggle, timeout);
    await waitForValue3(
      () => readToggle(toggle) === enabled ? true : void 0,
      timeout,
      `\u539F\u521B\u58F0\u660E\u672A\u80FD\u786E\u8BA4${enabled ? "\u5F00\u542F" : "\u5173\u95ED"}`
    );
  }
  async function preparePlatformSchedule(root, scheduledAt, timeout = 1e4) {
    const date = new Date(scheduledAt);
    if (Number.isNaN(date.getTime())) throw new Error("\u5B98\u65B9\u5B9A\u65F6\u65F6\u95F4\u683C\u5F0F\u65E0\u6548");
    const toggle = await waitForElement(
      root,
      ".post-time-wrapper .d-switch",
      timeout,
      "\u6CA1\u6709\u627E\u5230\u5B98\u65B9\u5B9A\u65F6\u53D1\u5E03\u63A7\u4EF6"
    );
    if (!readToggle(toggle)) toggle.click();
    await waitForValue3(
      () => readToggle(toggle) ? true : void 0,
      timeout,
      "\u5B98\u65B9\u5B9A\u65F6\u53D1\u5E03\u5F00\u5173\u672A\u80FD\u786E\u8BA4\u5F00\u542F"
    );
    const input = await waitForElement(
      root,
      ".date-picker-container input",
      timeout,
      "\u6CA1\u6709\u627E\u5230\u5B98\u65B9\u5B9A\u65F6\u53D1\u5E03\u65F6\u95F4\u8F93\u5165\u6846"
    );
    const value = formatPlatformDateTime(date);
    return { input, value };
  }
  async function verifyPlatformSchedule(input, value, timeout = 1e4) {
    await waitForValue3(
      () => input.value === value ? true : void 0,
      timeout,
      "\u5B98\u65B9\u5B9A\u65F6\u53D1\u5E03\u65F6\u95F4\u672A\u80FD\u786E\u8BA4"
    );
  }
  async function handleOriginalDialog(root, toggle, timeout) {
    const outcome = await waitForValue3(
      () => {
        if (readToggle(toggle)) return { confirmed: true };
        const footer = findByText(
          root.querySelectorAll("div.footer, [role='dialog']"),
          "\u58F0\u660E\u539F\u521B"
        );
        return footer ? { confirmed: false, footer } : void 0;
      },
      timeout,
      "\u539F\u521B\u58F0\u660E\u786E\u8BA4\u7A97\u53E3\u672A\u80FD\u6253\u5F00"
    );
    if (outcome.confirmed || !outcome.footer) return;
    const checkbox = outcome.footer.querySelector(".d-checkbox, input[type='checkbox']");
    if (checkbox && !readToggle(checkbox)) checkbox.click();
    const confirm = await waitForValue3(
      () => findButton(outcome.footer, "\u58F0\u660E\u539F\u521B"),
      timeout,
      "\u539F\u521B\u58F0\u660E\u786E\u8BA4\u6309\u94AE\u4E0D\u53EF\u7528"
    );
    confirm.click();
  }
  function findButton(root, label) {
    return [...root.querySelectorAll("button, [role='button']")].find(
      (item) => normalizedText3(item) === label && !isDisabled(item)
    );
  }
  function findByText(values, text, exact = false) {
    return [...values].find(
      (item) => exact ? normalizedText3(item) === text : normalizedText3(item).includes(text)
    );
  }
  function readToggle(element) {
    const input = element instanceof HTMLInputElement ? element : element.querySelector("input[type='checkbox']");
    return Boolean(
      input?.checked || element.getAttribute("aria-checked") === "true" || element.classList.contains("checked") || element.querySelector(".checked")
    );
  }
  function isDisabled(element) {
    return element instanceof HTMLButtonElement && element.disabled || element.hasAttribute("disabled") || element.getAttribute("aria-disabled") === "true" || element.classList.contains("disabled");
  }
  function formatPlatformDateTime(value) {
    const parts = new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    }).formatToParts(value);
    const read = (type) => parts.find((part) => part.type === type)?.value ?? "";
    return `${read("year")}-${read("month")}-${read("day")} ${read("hour")}:${read("minute")}`;
  }
  function normalizedText3(element) {
    return (element.innerText || element.textContent || "").replace(/\s+/g, "");
  }
  function waitForElement(root, selector, timeout, message) {
    return waitForValue3(() => root.querySelector(selector) ?? void 0, timeout, message);
  }
  async function waitForValue3(read, timeout, message) {
    const immediate = read();
    if (immediate !== void 0) return immediate;
    return new Promise((resolve, reject) => {
      const observer = new MutationObserver(() => {
        const value = read();
        if (value === void 0) return;
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
        subtree: true
      });
    });
  }

  // src/publisher-verification.ts
  var VERIFICATION_FRAME_SELECTOR = [
    "iframe[src*='captcha' i]",
    "iframe[src*='verify' i]",
    "iframe[src*='risk' i]",
    "iframe[title*='\u9A8C\u8BC1']"
  ].join(",");
  var VERIFICATION_CONTAINER_SELECTOR = [
    "[role='dialog']",
    "[role='alert']",
    "[class*='captcha' i]",
    "[class*='verify' i]",
    "[class*='risk' i]"
  ].join(",");
  var VERIFICATION_TEXT = /请完成.{0,8}(安全验证|扫码验证)|拖动.{0,8}滑块|扫码验证|操作频繁|环境异常/;
  function readPublicationVerification(root) {
    const frame = root.querySelector(VERIFICATION_FRAME_SELECTOR);
    if (frame && isVisible2(frame)) return "\u521B\u4F5C\u5E73\u53F0\u8981\u6C42\u5B8C\u6210\u5B89\u5168\u9A8C\u8BC1";
    const containers = root.querySelectorAll(VERIFICATION_CONTAINER_SELECTOR);
    for (const container of containers) {
      if (isVisible2(container) && VERIFICATION_TEXT.test(normalizedText4(container))) {
        return "\u521B\u4F5C\u5E73\u53F0\u8981\u6C42\u5B8C\u6210\u5B89\u5168\u9A8C\u8BC1";
      }
    }
    return void 0;
  }
  function isVisible2(element) {
    for (let current = element; current; current = current.parentElement) {
      if (current.hidden || current.getAttribute("aria-hidden") === "true" || current.style.display === "none" || current.style.visibility === "hidden") {
        return false;
      }
    }
    return true;
  }
  function normalizedText4(element) {
    return (element.innerText || element.textContent || "").replace(/\s+/g, "").slice(0, 300);
  }

  // src/managed-publisher-adapter.ts
  var ADAPTER_GLOBAL = "__XHS_DOWNLOADER_MANAGED_PUBLISHER_ADAPTER__";
  var UPLOAD_ATTRIBUTE = "data-xhd-managed-upload";
  var SCHEDULE_ATTRIBUTE = "data-xhd-managed-schedule";
  var PUBLISH_ATTRIBUTE = "data-xhd-managed-publish";
  var UPLOAD_SELECTOR = `[${UPLOAD_ATTRIBUTE}='true']`;
  var SCHEDULE_SELECTOR = `[${SCHEDULE_ATTRIBUTE}='true']`;
  var PUBLISH_SELECTOR = `[${PUBLISH_ATTRIBUTE}='true']`;
  function installManagedPublisherAdapter() {
    const scope = globalThis;
    if (scope[ADAPTER_GLOBAL]) return scope[ADAPTER_GLOBAL];
    installPublisherBridge();
    const adapter = {
      version: "1",
      prepareUpload,
      fill,
      verifySchedule,
      preparePublish,
      observeOutcome
    };
    scope[ADAPTER_GLOBAL] = adapter;
    return adapter;
  }
  async function prepareUpload(task) {
    try {
      const verification = verificationStep();
      if (verification) return verification;
      const mediaKind = validateTask(task);
      choosePublicationMode(document, mediaKind);
      const input = await waitForUploadInput(document, mediaKind);
      clearMarker(UPLOAD_ATTRIBUTE);
      input.setAttribute(UPLOAD_ATTRIBUTE, "true");
      return {
        ok: true,
        message: "\u521B\u4F5C\u9875\u7D20\u6750\u5165\u53E3\u5DF2\u51C6\u5907",
        action: "upload",
        mediaKind,
        selector: UPLOAD_SELECTOR
      };
    } catch {
      const verification = verificationStep();
      if (verification) return verification;
      return failure("\u521B\u4F5C\u9875\u7D20\u6750\u5165\u53E3\u51C6\u5907\u5931\u8D25");
    }
  }
  async function fill(task) {
    try {
      const verification = verificationStep();
      if (verification) return verification;
      const mediaKind = validateTask(task);
      await waitForMediaReady(document, mediaKind);
      const draft = task.package;
      const body = [draft.body, ...draft.tags.map((tag) => `#${tag}`)].filter(Boolean).join("\n");
      await fillPublicationForm(document, draft.title, body);
      await setPublicationVisibility(document, "private");
      await setOriginalDeclaration(document, draft.is_original);
      const blocked = verificationStep();
      if (blocked) return blocked;
      if (task.mode !== "platform_scheduled") {
        return { ok: true, message: "\u521B\u4F5C\u9875\u5185\u5BB9\u548C\u53D1\u5E03\u9009\u9879\u5DF2\u6838\u9A8C" };
      }
      const prepared = await preparePlatformSchedule(document, task.scheduled_at);
      clearMarker(SCHEDULE_ATTRIBUTE);
      prepared.input.setAttribute(SCHEDULE_ATTRIBUTE, "true");
      prepared.input.dataset.xhdExpectedValue = prepared.value;
      return {
        ok: true,
        message: "\u5B98\u65B9\u5B9A\u65F6\u8F93\u5165\u5DF2\u51C6\u5907",
        action: "type_schedule",
        selector: SCHEDULE_SELECTOR,
        value: prepared.value
      };
    } catch {
      const verification = verificationStep();
      if (verification) return verification;
      return failure("\u521B\u4F5C\u9875\u5185\u5BB9\u586B\u5145\u5931\u8D25");
    }
  }
  async function verifySchedule() {
    try {
      const input = document.querySelector(SCHEDULE_SELECTOR);
      if (!input) throw new Error("\u5B98\u65B9\u5B9A\u65F6\u8F93\u5165\u6846\u5DF2\u7ECF\u6D88\u5931");
      const expected = input.dataset.xhdExpectedValue;
      if (!expected) throw new Error("\u5B98\u65B9\u5B9A\u65F6\u76EE\u6807\u503C\u5DF2\u7ECF\u4E22\u5931");
      await verifyPlatformSchedule(input, expected);
      return { ok: true, message: "\u5B98\u65B9\u5B9A\u65F6\u65F6\u95F4\u5DF2\u56DE\u8BFB\u786E\u8BA4" };
    } catch {
      const verification = verificationStep();
      if (verification) return verification;
      return failure("\u5B98\u65B9\u5B9A\u65F6\u65F6\u95F4\u672A\u80FD\u786E\u8BA4");
    }
  }
  async function preparePublish() {
    try {
      const verification = verificationStep();
      if (verification) return verification;
      const control = await waitForPublishControl(document);
      if (!isCustomPublishControl(control)) {
        clearMarker(PUBLISH_ATTRIBUTE);
        control.setAttribute(PUBLISH_ATTRIBUTE, "true");
        return {
          ok: true,
          message: "\u539F\u751F\u53D1\u5E03\u6309\u94AE\u5DF2\u6838\u9A8C",
          action: "click_selector",
          selector: PUBLISH_SELECTOR
        };
      }
      const prepared = prepareManagedPublishControl();
      if (!prepared.ok) throw new Error(prepared.message);
      return {
        ok: true,
        message: "\u5C01\u95ED\u53D1\u5E03\u6309\u94AE\u5DF2\u51C6\u5907",
        action: "activate_focused"
      };
    } catch {
      const verification = verificationStep();
      if (verification) return verification;
      return failure("\u53D1\u5E03\u6309\u94AE\u672A\u80FD\u786E\u8BA4");
    }
  }
  function observeOutcome() {
    const verification = readPublicationVerification(document);
    if (verification) {
      return {
        ok: true,
        state: "awaiting_verification",
        message: verification
      };
    }
    const outcome = readPublishOutcome(document, window.location.pathname);
    if (!outcome) {
      return { ok: true, state: "pending", message: "\u7B49\u5F85\u521B\u4F5C\u5E73\u53F0\u786E\u8BA4" };
    }
    const resultUrl = outcome.status === "published" && window.location.hostname === "www.xiaohongshu.com" && /^\/(?:explore|discovery\/item)\/[a-z0-9]+\/?$/i.test(window.location.pathname) ? `https://www.xiaohongshu.com${window.location.pathname}` : void 0;
    return {
      ok: true,
      state: outcome.status,
      message: outcome.status === "published" ? "\u521B\u4F5C\u5E73\u53F0\u5DF2\u786E\u8BA4\u53D1\u5E03\u6210\u529F" : "\u521B\u4F5C\u5E73\u53F0\u660E\u786E\u62A5\u544A\u53D1\u5E03\u5931\u8D25",
      resultUrl
    };
  }
  function validateTask(task) {
    if (task.target_driver !== "managed") throw new Error("\u53D1\u5E03\u4EFB\u52A1\u9A71\u52A8\u65E0\u6548");
    if (task.package.visibility !== "private") {
      throw new Error("\u53D7\u7BA1\u53D1\u5E03\u53EA\u652F\u6301\u4EC5\u81EA\u5DF1\u53EF\u89C1");
    }
    if (task.package.products.length) throw new Error("\u53D7\u7BA1\u53D1\u5E03\u4E0D\u652F\u6301\u7ED1\u5B9A\u5546\u54C1");
    const assets = task.package.assets;
    if (!assets.length) throw new Error("\u53D1\u5E03\u4EFB\u52A1\u6CA1\u6709\u7D20\u6750");
    const videoAssets = assets.filter((asset) => asset.media_type.startsWith("video/"));
    const imageAssets = assets.filter((asset) => asset.media_type.startsWith("image/"));
    if (videoAssets.length) {
      if (videoAssets.length !== 1 || assets.length !== 1) {
        throw new Error("\u89C6\u9891\u7B14\u8BB0\u7D20\u6750\u7EC4\u5408\u65E0\u6548");
      }
      if (task.package.is_original) {
        throw new Error("\u89C6\u9891\u7B14\u8BB0\u6682\u4E0D\u652F\u6301\u539F\u521B\u58F0\u660E");
      }
      return "video";
    }
    if (imageAssets.length !== assets.length || assets.length > 18) {
      throw new Error("\u56FE\u6587\u7B14\u8BB0\u7D20\u6750\u7EC4\u5408\u65E0\u6548");
    }
    return "image";
  }
  function verificationStep() {
    const message = readPublicationVerification(document);
    return message ? { ok: false, message, verification: true } : void 0;
  }
  function clearMarker(attribute) {
    document.querySelectorAll(`[${attribute}]`).forEach((element) => element.removeAttribute(attribute));
  }
  function failure(message) {
    return {
      ok: false,
      message
    };
  }
  installManagedPublisherAdapter();
})();
