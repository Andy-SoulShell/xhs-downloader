/* 由 apps/extension/build.mjs 生成，请勿手工修改。 */
"use strict";
(() => {
  // src/browser-action-errors.ts
  var UncertainBrowserActionError = class extends Error {
    constructor(message) {
      super(message);
      this.name = "UncertainBrowserActionError";
    }
  };

  // src/browser-page-diagnostics.ts
  var ADAPTER_VERSION = "xhs-web-2026.07";
  var COMMON_ANCHORS = {
    initial_state: "script",
    main_container: ".main-container"
  };
  var PAGE_ANCHORS = {
    home: {
      feed_container: ".feeds-container, [class*='feeds-container']"
    },
    search: {
      filter_control: ".filter, [class*='filter']",
      feed_container: ".feeds-container, [class*='feeds-container']"
    },
    feed_detail: {
      comment_container: ".comments-container",
      detail_container: ".note-detail-mask, [class*='note-detail']"
    },
    profile: {
      profile_container: ".user-page, [class*='user-page']"
    }
  };
  function buildPageCompatibilityDiagnostics(page, pageUrl) {
    const pageKind = classifyPage(pageUrl);
    const expected = {
      ...COMMON_ANCHORS,
      ...PAGE_ANCHORS[pageKind] ?? {}
    };
    const matched = Object.entries(expected).filter(
      ([name, selector]) => name === "initial_state" ? hasInitialStateScript(page) : Boolean(page.querySelector(selector))
    ).map(([name]) => name);
    const missing = Object.keys(expected).filter(
      (name) => !matched.includes(name)
    );
    return {
      adapter_version: ADAPTER_VERSION,
      selector_profile: detectSelectorProfile(page),
      page_kind: pageKind,
      matched_anchors: matched,
      missing_anchors: missing
    };
  }
  function classifyPage(value) {
    try {
      const pathname = new URL(value).pathname;
      if (pathname.startsWith("/search_result")) return "search";
      if (pathname.startsWith("/user/profile/")) return "profile";
      if (pathname.startsWith("/explore/") || pathname.startsWith("/discovery/item/")) {
        return "feed_detail";
      }
      if (pathname === "/" || pathname.startsWith("/explore")) return "home";
    } catch {
      return "unknown";
    }
    return "unknown";
  }
  function detectSelectorProfile(page) {
    if (hasInitialStateScript(page)) return "initial-state-v1";
    if (page.querySelector(".main-container, #global")) return "semantic-dom-v1";
    return "unknown";
  }
  function hasInitialStateScript(page) {
    return [...page.scripts].some(
      (script) => script.textContent?.includes("__INITIAL_STATE__")
    );
  }

  // src/parser.ts
  function parseInitialStateValue(script) {
    const separator = script.indexOf("=");
    if (separator < 0) throw new Error("\u5E16\u5B50\u521D\u59CB\u72B6\u6001\u683C\u5F0F\u65E0\u6548");
    const raw = script.slice(separator + 1).trim().replace(/;$/, "");
    let state;
    try {
      state = JSON.parse(normalizeJavaScriptValue(raw));
    } catch {
      throw new Error("\u5E16\u5B50\u521D\u59CB\u72B6\u6001\u65E0\u6CD5\u89E3\u6790");
    }
    return state;
  }
  function normalizeJavaScriptValue(value) {
    let result = "";
    let quote = "";
    let escaped = false;
    for (let index = 0; index < value.length; index += 1) {
      const character = value[index];
      if (quote) {
        result += character;
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === quote) quote = "";
        continue;
      }
      if (character === '"' || character === "'") {
        quote = character;
        result += character;
        continue;
      }
      const token = value.slice(index, index + 9);
      if (token === "undefined" && isBoundary(value[index - 1]) && isBoundary(value[index + 9])) {
        result += "null";
        index += 8;
        continue;
      }
      result += character;
    }
    return result;
  }
  function isBoundary(value) {
    return !value || !/[A-Za-z0-9_$]/.test(value);
  }

  // src/login-state.ts
  var USER_CHANNEL_SELECTOR = ".main-container .user .link-wrapper .channel";
  var LOGIN_SELECTOR = ".login-container, [class*='login-container']";
  var INITIAL_STATE_PREFIX = "window.__INITIAL_STATE__";
  function detectLoginState(page, pageUrl) {
    const user = readCurrentUser(page);
    const hasUserChannel = Boolean(page.querySelector(USER_CHANNEL_SELECTOR));
    const loginVisible = new URL(pageUrl).pathname.includes("login") || Boolean(page.querySelector(LOGIN_SELECTOR));
    const loggedIn = Boolean(user && !user.guest) || hasUserChannel;
    return {
      logged_in: loggedIn && !loginVisible,
      user_id: loggedIn ? text(user?.userId ?? user?.user_id) || null : null,
      nickname: loggedIn ? text(user?.nickname ?? user?.nickName) || null : null
    };
  }
  function readCurrentUser(page) {
    const scripts = [...page.scripts].map((script) => script.textContent?.trim() ?? "").filter((value) => value.startsWith(INITIAL_STATE_PREFIX)).reverse();
    for (const script of scripts) {
      try {
        const state = object(parseInitialStateValue(script));
        const user = object(state.user);
        const rawInfo = object(user.userInfo);
        const info = object(rawInfo.value ?? rawInfo);
        if (Object.keys(info).length) return info;
      } catch {
      }
    }
    return void 0;
  }
  function object(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }
  function text(value) {
    return typeof value === "string" || typeof value === "number" ? String(value) : "";
  }

  // src/login-qrcode.ts
  var QR_VALIDITY_MILLISECONDS = 4 * 60 * 1e3;
  var QR_WAIT_MILLISECONDS = 1e4;
  var QR_POLL_INTERVAL_MILLISECONDS = 250;
  var MAX_QR_DATA_URL_LENGTH = 512e3;
  var QR_DATA_PATTERN = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=\r\n]+$/;
  var QR_IMAGE_SELECTOR = [
    ".login-container .qrcode-img",
    '.login-container img[class*="qrcode"]',
    '.login-container img[alt*="\u4E8C\u7EF4\u7801"]'
  ].join(",");
  function readLoginQrCode(page, pageUrl, now = /* @__PURE__ */ new Date()) {
    if (detectLoginState(page, pageUrl).logged_in) {
      return {
        is_logged_in: true,
        image_data_url: null,
        expires_at: null,
        consumed: false
      };
    }
    const image = page.querySelector(QR_IMAGE_SELECTOR);
    const source = image?.currentSrc || image?.getAttribute("src") || "";
    if (!source || source.length > MAX_QR_DATA_URL_LENGTH || !QR_DATA_PATTERN.test(source)) {
      throw new Error("\u767B\u5F55\u9875\u6CA1\u6709\u53EF\u5B89\u5168\u4EA4\u4ED8\u7684\u4E8C\u7EF4\u7801\uFF0C\u8BF7\u5237\u65B0\u9875\u9762\u540E\u91CD\u8BD5");
    }
    return {
      is_logged_in: false,
      image_data_url: source,
      expires_at: new Date(
        now.getTime() + QR_VALIDITY_MILLISECONDS
      ).toISOString(),
      consumed: false
    };
  }
  async function waitForLoginQrCode(page, pageUrl, timeoutMilliseconds = QR_WAIT_MILLISECONDS, pollIntervalMilliseconds = QR_POLL_INTERVAL_MILLISECONDS) {
    const deadline = Date.now() + timeoutMilliseconds;
    let lastError;
    do {
      try {
        return readLoginQrCode(page, pageUrl);
      } catch (error) {
        lastError = error;
      }
      await delay(pollIntervalMilliseconds);
    } while (Date.now() < deadline);
    throw lastError instanceof Error ? lastError : new Error("\u767B\u5F55\u9875\u6CA1\u6709\u53EF\u5B89\u5168\u4EA4\u4ED8\u7684\u4E8C\u7EF4\u7801\uFF0C\u8BF7\u5237\u65B0\u9875\u9762\u540E\u91CD\u8BD5");
  }
  function delay(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  // src/browser-state-bridge.ts
  var REQUEST_EVENT = "xhd-browser-state-request";
  var RESPONSE_EVENT = "xhd-browser-state-response";
  function readLiveInitialState(page, timeoutMilliseconds = 1e3) {
    const scope = page.defaultView;
    if (!scope) return Promise.reject(new Error("\u5F53\u524D\u9875\u9762\u6CA1\u6709\u53EF\u7528\u7A97\u53E3"));
    const requestId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timeout = scope.setTimeout(() => {
        scope.removeEventListener(RESPONSE_EVENT, onResponse);
        reject(new Error("\u8BFB\u53D6\u5C0F\u7EA2\u4E66\u5B9E\u65F6\u72B6\u6001\u8D85\u65F6"));
      }, timeoutMilliseconds);
      const onResponse = (event) => {
        const response = parseResponse(event.detail);
        if (!response || response.requestId !== requestId) return;
        scope.clearTimeout(timeout);
        scope.removeEventListener(RESPONSE_EVENT, onResponse);
        if (!response.ok || !response.data) {
          reject(new Error(response.message || "\u5C0F\u7EA2\u4E66\u5B9E\u65F6\u72B6\u6001\u4E0D\u53EF\u7528"));
          return;
        }
        try {
          resolve(JSON.parse(response.data));
        } catch {
          reject(new Error("\u5C0F\u7EA2\u4E66\u5B9E\u65F6\u72B6\u6001\u683C\u5F0F\u65E0\u6548"));
        }
      };
      scope.addEventListener(RESPONSE_EVENT, onResponse);
      scope.dispatchEvent(
        new CustomEvent(REQUEST_EVENT, {
          detail: JSON.stringify({ requestId })
        })
      );
    });
  }
  function browserStateEvents() {
    return { request: REQUEST_EVENT, response: RESPONSE_EVENT };
  }
  function parseResponse(value) {
    if (typeof value !== "string") return null;
    try {
      const parsed = JSON.parse(value);
      return typeof parsed.requestId === "string" ? parsed : null;
    } catch {
      return null;
    }
  }

  // src/comment-loader.ts
  var COMMENT_SELECTOR = ".comments-container .parent-comment";
  var END_SELECTOR = ".comments-container .end-container, .comments-container .no-more";
  function needsCommentLoading(options) {
    return options.commentLimit > 10 || options.includeReplies;
  }
  async function loadComments(page, options) {
    if (!needsCommentLoading(options) || options.commentLimit === 0) return;
    const container = await waitForCommentContainer(page);
    if (!container) throw new Error("\u8BE6\u60C5\u9875\u8BC4\u8BBA\u533A\u5C1A\u672A\u52A0\u8F7D");
    const maxAttempts = Math.min(30, Math.max(4, options.commentLimit + 2));
    let stagnantRounds = 0;
    let previousCount = -1;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const comments = [...page.querySelectorAll(COMMENT_SELECTOR)];
      if (options.includeReplies) {
        expandReplies(comments, options.replyLimit);
      }
      if (comments.length >= options.commentLimit || page.querySelector(END_SELECTOR)) {
        return;
      }
      stagnantRounds = comments.length === previousCount ? stagnantRounds + 1 : 0;
      if (stagnantRounds >= 4) return;
      previousCount = comments.length;
      const last = comments.at(-1);
      last?.scrollIntoView?.({ block: "end" });
      container.scrollTop = container.scrollHeight;
      page.defaultView?.scrollBy(0, page.defaultView.innerHeight * 0.8);
      await delay2(250);
    }
  }
  async function waitForCommentContainer(page) {
    const findContainer = () => page.querySelector(
      ".comments-container, [class*='comments-container']"
    );
    let container = findContainer();
    if (container || !page.defaultView) return container;
    page.defaultView.scrollBy(0, page.defaultView.innerHeight * 0.8);
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await delay2(250);
      container = findContainer();
      if (container) return container;
    }
    return null;
  }
  function expandReplies(comments, replyLimit) {
    if (replyLimit <= 0) return;
    let clicked = 0;
    for (const comment of comments) {
      if (clicked >= replyLimit) return;
      const control = comment.querySelector(".show-more");
      if (!control || control.dataset.xhdExpanded === "true") continue;
      control.dataset.xhdExpanded = "true";
      control.click();
      clicked += 1;
    }
  }
  function delay2(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  // src/comment-runner.ts
  var COMMENT_ELEMENTS = ".comments-container .parent-comment, .comments-container .comment-item";
  async function postComment(page, feedId, content) {
    return submitComment(page, feedId, content);
  }
  async function replyComment(page, feedId, content, target) {
    const comment = await findTargetCommentWithLoading(page, target);
    if (!comment) throw new Error("\u8BC4\u8BBA\u533A\u6CA1\u6709\u627E\u5230\u56DE\u590D\u76EE\u6807");
    comment.scrollIntoView?.({ block: "center" });
    const reply = comment.querySelector(
      ".right .interactions .reply, .interactions .reply, .reply"
    );
    if (!reply) throw new Error("\u76EE\u6807\u8BC4\u8BBA\u6CA1\u6709\u56DE\u590D\u6309\u94AE");
    reply.click();
    await delay3(150);
    return submitComment(page, feedId, content);
  }
  async function findTargetCommentWithLoading(page, target) {
    const container = page.querySelector(".comments-container");
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const match = findTargetComment(page, target);
      if (match) return match;
      if (!container || page.querySelector(
        ".comments-container .end-container, .comments-container .no-more"
      )) {
        return null;
      }
      const comments = page.querySelectorAll(COMMENT_ELEMENTS);
      comments.item(comments.length - 1)?.scrollIntoView?.({ block: "end" });
      container.scrollTop = container.scrollHeight;
      page.defaultView?.scrollBy(0, page.defaultView.innerHeight * 0.8);
      await delay3(250);
    }
    return null;
  }
  async function submitComment(page, feedId, content) {
    const before = matchingComments(page, content).length;
    const input = await waitForCommentInput(page);
    if (!input) throw new Error("\u9875\u9762\u6CA1\u6709\u53EF\u7528\u7684\u8BC4\u8BBA\u8F93\u5165\u6846");
    fillContentEditable(page, input, content);
    const submit = await waitForEnabledSubmit(page);
    if (!submit) throw new Error("\u8BC4\u8BBA\u63D0\u4EA4\u6309\u94AE\u5F53\u524D\u4E0D\u53EF\u7528");
    submit.click();
    for (let attempt = 0; attempt < 16; attempt += 1) {
      const matches = matchingComments(page, content);
      if (matches.length > before) {
        return {
          feed_id: feedId,
          comment_id: commentId(matches.at(-1) ?? null),
          verified: true
        };
      }
      await delay3(250);
    }
    throw new UncertainBrowserActionError(
      "\u8BC4\u8BBA\u63D0\u4EA4\u5DF2\u89E6\u53D1\uFF0C\u4F46\u672A\u5728\u8BC4\u8BBA\u533A\u786E\u8BA4\u7ED3\u679C\uFF0C\u8BF7\u4EBA\u5DE5\u6838\u5BF9"
    );
  }
  async function waitForCommentInput(page) {
    let activated = false;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const activator = page.querySelector(
        "div.input-box div.content-edit span"
      );
      if (activator && !activated) {
        activator.click();
        activated = true;
        await delay3(150);
      }
      const input = page.querySelector(
        "div.input-box div.content-edit p.content-input, div.input-box [contenteditable='true']"
      );
      if (input) return input;
      await delay3(250);
    }
    return null;
  }
  function findTargetComment(page, target) {
    if (target.commentId) {
      const direct = page.getElementById(`comment-${target.commentId}`);
      if (direct instanceof HTMLElement) return direct;
    }
    if (!target.userId) return null;
    return [...page.querySelectorAll(COMMENT_ELEMENTS)].find(
      (item) => [...item.querySelectorAll("[data-user-id]")].some(
        (user) => user.dataset.userId === target.userId
      )
    ) ?? null;
  }
  function fillContentEditable(page, input, content) {
    input.focus();
    const scope = page.defaultView;
    const selection = scope?.getSelection();
    if (selection) {
      const range = page.createRange();
      range.selectNodeContents(input);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    if (typeof page.execCommand === "function" && page.execCommand("insertText", false, content)) {
      return;
    }
    const beforeInput = scope ? new scope.InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      inputType: "insertText",
      data: content
    }) : new Event("beforeinput", { bubbles: true, cancelable: true });
    if (!input.dispatchEvent(beforeInput)) return;
    input.textContent = content;
    const event = scope ? new scope.InputEvent("input", {
      bubbles: true,
      inputType: "insertText",
      data: content
    }) : new Event("input", { bubbles: true });
    input.dispatchEvent(event);
  }
  async function waitForEnabledSubmit(page) {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const submit = page.querySelector(
        "div.bottom button.submit"
      );
      if (submit && !submit.disabled) return submit;
      await delay3(100);
    }
    return null;
  }
  function matchingComments(page, content) {
    const expected = normalize(content);
    return [...page.querySelectorAll(COMMENT_ELEMENTS)].filter(
      (item) => normalize(item.textContent ?? "").includes(expected)
    );
  }
  function commentId(element) {
    if (!element) return null;
    return element.dataset.commentId ?? (element.id.startsWith("comment-") ? element.id.slice(8) : null);
  }
  function normalize(value) {
    return value.replace(/\s+/g, " ").trim();
  }
  function delay3(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  // src/page-data.ts
  var INITIAL_STATE_PREFIX2 = "window.__INITIAL_STATE__";
  function latestInitialState(page) {
    const scripts = [...page.scripts].map((script) => script.textContent?.trim() ?? "").filter((value) => value.startsWith(INITIAL_STATE_PREFIX2)).reverse();
    for (const script of scripts) {
      try {
        return parseInitialStateValue(script);
      } catch {
      }
    }
    throw new Error("\u5F53\u524D\u9875\u9762\u6CA1\u6709\u53EF\u89E3\u6790\u7684\u5C0F\u7EA2\u4E66\u72B6\u6001\u6570\u636E");
  }
  function dataRecord(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }
  function dataList(value) {
    return Array.isArray(value) ? value : [];
  }
  function unwrapState(value) {
    const object2 = dataRecord(value);
    if ("value" in object2) return object2.value;
    if ("_value" in object2) return object2._value;
    return value;
  }
  function dataText(value) {
    return typeof value === "string" || typeof value === "number" ? String(value) : "";
  }
  function dataInteger(value) {
    const result = Number(value);
    return Number.isFinite(result) && result >= 0 ? Math.trunc(result) : null;
  }
  function dataBoolean(value, fallback = false) {
    return typeof value === "boolean" ? value : fallback;
  }
  function dataUrl(value) {
    const raw = dataText(value);
    try {
      const url = new URL(raw);
      return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
    } catch {
      return null;
    }
  }

  // src/feed-parser.ts
  function parseFeedListDocument(page, source, keyword = null, currentState) {
    const state = currentState ?? latestInitialState(page);
    const container = dataRecord(state[source === "home" ? "feed" : "search"]);
    if (!("feeds" in container)) {
      throw new Error(source === "home" ? "\u63A8\u8350\u6D41\u5C1A\u672A\u52A0\u8F7D" : "\u641C\u7D22\u7ED3\u679C\u5C1A\u672A\u52A0\u8F7D");
    }
    return {
      items: parseFeedSummaries(unwrapState(container.feeds)).slice(0, 200),
      source,
      keyword: source === "search" ? keyword : null,
      has_more: dataBoolean(container.hasMore ?? container.has_more),
      cursor: dataText(container.cursor).slice(0, 2048)
    };
  }
  function parseFeedSummaries(value) {
    return flattenFeeds(value).map(parseFeedSummary).filter((item) => item !== null);
  }
  function parseFeedAuthor(value) {
    const user = dataRecord(value);
    const userId = dataText(user.userId ?? user.user_id);
    if (!userId) return null;
    return {
      user_id: userId,
      nickname: dataText(user.nickname ?? user.nickName).slice(0, 200),
      avatar_url: dataUrl(user.avatar ?? user.image)
    };
  }
  function parseFeedMetrics(value) {
    const metrics = dataRecord(value);
    return {
      liked: dataBoolean(metrics.liked),
      liked_count: dataText(metrics.likedCount) || "0",
      collected: dataBoolean(metrics.collected),
      collected_count: dataText(metrics.collectedCount) || "0",
      comment_count: dataText(metrics.commentCount) || "0",
      shared_count: dataText(metrics.sharedCount) || "0"
    };
  }
  function parseFeedSummary(value) {
    const feed = dataRecord(value);
    const note = dataRecord(feed.noteCard);
    const author = parseFeedAuthor(note.user);
    const feedId = dataText(feed.id ?? note.noteId);
    if (!feedId || !author) return null;
    const cover = dataRecord(note.cover);
    const video = dataRecord(note.video);
    const capability = dataRecord(video.capa);
    return {
      feed_id: feedId,
      xsec_token: dataText(feed.xsecToken ?? note.xsecToken),
      title: dataText(note.displayTitle ?? note.title).slice(0, 500),
      note_type: noteType(note.type),
      author,
      metrics: parseFeedMetrics(note.interactInfo),
      cover_url: dataUrl(cover.urlDefault ?? cover.urlPre ?? cover.url),
      cover_width: dataInteger(cover.width),
      cover_height: dataInteger(cover.height),
      video_duration: dataInteger(capability.duration)
    };
  }
  function flattenFeeds(value) {
    return dataList(value).flatMap(
      (item) => Array.isArray(item) ? flattenFeeds(item) : [item]
    );
  }
  function noteType(value) {
    const type = dataText(value).toLowerCase();
    if (type === "video") return "video";
    if (type === "normal" || type === "image") return "image";
    return "unknown";
  }

  // src/feed-detail-parser.ts
  function parseFeedDetailDocument(page, options, currentState) {
    const state = currentState ?? latestInitialState(page);
    const noteState = dataRecord(state.note);
    const detailMap = dataRecord(noteState.noteDetailMap);
    const wrapper = findDetail(detailMap, options.feedId);
    const note = dataRecord(wrapper.note);
    const author = parseFeedAuthor(note.user);
    if (!author || dataText(note.noteId) !== options.feedId) {
      throw new Error("\u8BE6\u60C5\u9875\u6570\u636E\u4E0E\u8BF7\u6C42\u7684\u5E16\u5B50\u4E0D\u4E00\u81F4");
    }
    const comments = dataRecord(unwrapState(wrapper.comments));
    return {
      feed_id: options.feedId,
      xsec_token: dataText(note.xsecToken) || options.xsecToken,
      title: dataText(note.title).slice(0, 500),
      body: dataText(note.desc).slice(0, 2e4),
      note_type: noteType2(note.type),
      author,
      metrics: parseFeedMetrics(note.interactInfo),
      image_urls: dataList(note.imageList).map((item) => {
        const image = dataRecord(item);
        return dataUrl(image.urlDefault ?? image.urlPre ?? image.url);
      }).filter((url) => url !== null).slice(0, 100),
      published_at: dataInteger(note.time),
      ip_location: dataText(note.ipLocation).slice(0, 200),
      comments: dataList(unwrapState(comments.list)).slice(0, options.commentLimit).map(
        (item) => parseComment(item, options.includeReplies, options.replyLimit)
      ).filter((item) => item !== null),
      comments_has_more: dataBoolean(comments.hasMore),
      comments_cursor: dataText(comments.cursor).slice(0, 2048)
    };
  }
  function findDetail(detailMap, feedId) {
    const direct = dataRecord(detailMap[feedId]);
    if (Object.keys(direct).length) return direct;
    const match = Object.values(detailMap).map(dataRecord).find((item) => dataText(dataRecord(item.note).noteId) === feedId);
    if (!match) throw new Error("\u8BE6\u60C5\u9875\u6CA1\u6709\u8BF7\u6C42\u7684\u5E16\u5B50\u6570\u636E");
    return match;
  }
  function parseComment(value, includeReplies, replyLimit) {
    const comment = dataRecord(value);
    const author = parseFeedAuthor(comment.userInfo);
    const commentId2 = dataText(comment.id);
    if (!commentId2 || !author) return null;
    const replies = includeReplies ? dataList(unwrapState(comment.subComments)).slice(0, replyLimit).map((item) => parseComment(item, false, 0)).filter((item) => item !== null) : [];
    return {
      comment_id: commentId2,
      content: dataText(comment.content).slice(0, 5e3),
      author,
      liked: dataBoolean(comment.liked),
      like_count: dataText(comment.likeCount) || "0",
      created_at: dataInteger(comment.createTime),
      ip_location: dataText(comment.ipLocation).slice(0, 200),
      reply_count: dataText(comment.subCommentCount) || String(replies.length),
      replies
    };
  }
  function noteType2(value) {
    const type = dataText(value).toLowerCase();
    if (type === "video") return "video";
    if (type === "normal" || type === "image") return "image";
    return "unknown";
  }

  // src/interaction-runner.ts
  var SELECTORS = {
    like: ".interact-container .left .like-lottie",
    favorite: ".interact-container .left .reds-icon.collect-icon"
  };
  var CONTROL_READY_ATTEMPTS = 20;
  var CONTROL_READY_INTERVAL_MS = 250;
  async function setDesiredInteraction(page, feedId, kind, active, activate) {
    const before = interactionState(
      await readLiveInitialState(page),
      feedId,
      kind
    );
    if (before === active) {
      return { feed_id: feedId, active, changed: false, verified: true };
    }
    const control = await waitForInteractionControl(page, kind);
    if (!control) {
      throw new Error(kind === "like" ? "\u9875\u9762\u6CA1\u6709\u70B9\u8D5E\u6309\u94AE" : "\u9875\u9762\u6CA1\u6709\u6536\u85CF\u6309\u94AE");
    }
    if (activate) await activate();
    else clickInteractionControl(page, control);
    for (let attempt = 0; attempt < 16; attempt += 1) {
      try {
        const current = interactionState(
          await readLiveInitialState(page),
          feedId,
          kind
        );
        if (current === active) {
          return { feed_id: feedId, active, changed: true, verified: true };
        }
      } catch {
      }
      await delay4(250);
    }
    const action = kind === "like" ? "\u70B9\u8D5E" : "\u6536\u85CF";
    throw new UncertainBrowserActionError(
      `${action}\u64CD\u4F5C\u5DF2\u89E6\u53D1\uFF0C\u4F46\u672A\u80FD\u786E\u8BA4\u6700\u7EC8\u72B6\u6001\uFF0C\u8BF7\u4EBA\u5DE5\u6838\u5BF9`
    );
  }
  async function waitForInteractionControl(page, kind) {
    for (let attempt = 0; attempt < CONTROL_READY_ATTEMPTS; attempt += 1) {
      const control = page.querySelector(SELECTORS[kind]);
      if (control) return control;
      await delay4(CONTROL_READY_INTERVAL_MS);
    }
    return null;
  }
  function clickInteractionControl(page, control) {
    const clickable = control;
    if (typeof clickable.click === "function") {
      clickable.click();
      return;
    }
    const MouseEventConstructor = page.defaultView?.MouseEvent;
    if (!MouseEventConstructor) {
      throw new Error("\u5F53\u524D\u9875\u9762\u65E0\u6CD5\u89E6\u53D1\u4E92\u52A8\u6309\u94AE");
    }
    control.dispatchEvent(
      new MouseEventConstructor("click", {
        bubbles: true,
        cancelable: true,
        composed: true
      })
    );
  }
  function interactionState(state, feedId, kind) {
    const note = dataRecord(state.note);
    const detailMap = dataRecord(note.noteDetailMap);
    const direct = dataRecord(detailMap[feedId]);
    const wrapper = (Object.keys(direct).length ? direct : null) ?? Object.values(detailMap).map(dataRecord).find((item) => dataText(dataRecord(item.note).noteId) === feedId);
    const interact = dataRecord(dataRecord(wrapper).note);
    const info = dataRecord(interact.interactInfo);
    const field = kind === "like" ? "liked" : "collected";
    if (typeof info[field] !== "boolean") {
      throw new Error("\u9875\u9762\u6CA1\u6709\u53EF\u6838\u9A8C\u7684\u4E92\u52A8\u72B6\u6001");
    }
    return info[field];
  }
  function delay4(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  // src/profile-parser.ts
  function parseUserProfileDocument(page, requestedUserId, currentState) {
    const state = currentState ?? latestInitialState(page);
    const userState = dataRecord(state.user);
    const pageData = dataRecord(unwrapState(userState.userPageData));
    const basic = dataRecord(pageData.basicInfo);
    if (!Object.keys(basic).length) throw new Error("\u7528\u6237\u4E3B\u9875\u8D44\u6599\u5C1A\u672A\u52A0\u8F7D");
    const feeds = parseFeedSummaries(unwrapState(userState.notes));
    return {
      user_id: dataText(basic.userId ?? basic.user_id) || requestedUserId || null,
      nickname: dataText(basic.nickname).slice(0, 200),
      red_id: dataText(basic.redId).slice(0, 200),
      description: dataText(basic.desc).slice(0, 5e3),
      avatar_url: dataUrl(basic.imageb ?? basic.images),
      ip_location: dataText(basic.ipLocation).slice(0, 200),
      metrics: dataList(pageData.interactions).map(parseMetric).filter((item) => item !== null),
      feeds: feeds.slice(0, 500)
    };
  }
  function parseMetric(value) {
    const metric = dataRecord(value);
    const name = dataText(metric.name);
    if (!name) return null;
    return {
      name: name.slice(0, 100),
      count: (dataText(metric.count) || "0").slice(0, 100),
      metric_type: dataText(metric.type).slice(0, 100)
    };
  }

  // src/search-filters.ts
  var DEFAULT_FILTERS = {
    sort_by: "\u7EFC\u5408",
    note_type: "\u4E0D\u9650",
    publish_time: "\u4E0D\u9650",
    search_scope: "\u4E0D\u9650",
    location: "\u4E0D\u9650"
  };
  var FILTER_GROUPS = [
    "sort_by",
    "note_type",
    "publish_time",
    "search_scope",
    "location"
  ];
  function hasCustomSearchFilters(filters) {
    return FILTER_GROUPS.some(
      (field) => typeof filters[field] === "string" && filters[field] !== DEFAULT_FILTERS[field]
    );
  }
  async function applySearchFilters(page, filters) {
    const triggerCandidate = page.querySelector(".filter") ?? findExactTextElement(page, "\u7B5B\u9009");
    const trigger = triggerCandidate?.closest(
      "button, [role='button'], div.filter, div"
    ) ?? triggerCandidate;
    if (!trigger) throw new Error("\u641C\u7D22\u9875\u6CA1\u6709\u7B5B\u9009\u5165\u53E3");
    trigger.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
    trigger.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    const scope = await waitForFilterOptions(page);
    for (const field of FILTER_GROUPS) {
      const wanted = filters[field];
      if (typeof wanted !== "string" || wanted === DEFAULT_FILTERS[field]) continue;
      const target = [...scope.querySelectorAll("div.tags")].find(
        (item) => item.textContent?.trim() === wanted
      ) ?? findExactTextElement(scope, wanted);
      if (!target) throw new Error(`\u641C\u7D22\u9875\u6CA1\u6709\u7B5B\u9009\u9009\u9879 ${wanted}`);
      target.click();
      await delay5(150);
    }
    await delay5(350);
  }
  async function waitForFilterOptions(page) {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const panel = page.querySelector(".filter-panel");
      if (panel) return panel;
      if (findExactTextElement(page, "\u6700\u65B0")) return page;
      await delay5(100);
    }
    throw new Error("\u641C\u7D22\u7B5B\u9009\u9762\u677F\u672A\u80FD\u53CA\u65F6\u6253\u5F00");
  }
  function findExactTextElement(scope, text2) {
    const candidates = scope.querySelectorAll(
      "button, [role='button'], div, span"
    );
    return [...candidates].find(
      (element) => element.textContent?.trim() === text2 && ![...element.children].some(
        (child) => child.textContent?.trim() === text2
      )
    ) ?? null;
  }
  function delay5(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  // src/browser-page-runner.ts
  var SEARCH_READY_ATTEMPTS = 20;
  var SEARCH_READY_INTERVAL_MS = 250;
  async function executeBrowserPageTask(task, page, pageUrl, actions = {}) {
    if (task.kind === "check_login_status") {
      const state = detectLoginState(page, pageUrl);
      return {
        ok: true,
        message: state.logged_in ? "\u6D4F\u89C8\u5668\u5DF2\u767B\u5F55\u5C0F\u7EA2\u4E66" : "\u6D4F\u89C8\u5668\u5C1A\u672A\u767B\u5F55\u5C0F\u7EA2\u4E66",
        result: { ...state }
      };
    }
    if (task.kind === "get_login_qrcode") {
      const result = await waitForLoginQrCode(page, pageUrl);
      return success(
        result.is_logged_in ? "\u6D4F\u89C8\u5668\u5DF2\u767B\u5F55\uFF0C\u65E0\u9700\u518D\u6B21\u626B\u7801" : "\u767B\u5F55\u4E8C\u7EF4\u7801\u5DF2\u751F\u6210\uFF0C\u767B\u5F55\u9875\u9762\u5C06\u4FDD\u6301\u6253\u5F00",
        result
      );
    }
    if (task.kind === "list_feeds") {
      return success("\u63A8\u8350\u6D41\u8BFB\u53D6\u5B8C\u6210", parseFeedListDocument(page, "home"));
    }
    if (task.kind === "search_feeds") {
      const keyword = payloadText(task, "keyword");
      const filters = payloadRecord(task, "filters");
      if (hasCustomSearchFilters(filters)) {
        await applySearchFilters(page, filters);
      }
      return success(
        "\u641C\u7D22\u7ED3\u679C\u8BFB\u53D6\u5B8C\u6210",
        await waitForSearchResult(page, keyword)
      );
    }
    if (task.kind === "get_feed_detail") {
      const options = {
        feedId: payloadText(task, "feed_id"),
        xsecToken: payloadText(task, "xsec_token"),
        commentLimit: payloadNumber(task, "comment_limit"),
        includeReplies: task.payload.include_replies === true,
        replyLimit: payloadNumber(task, "reply_limit")
      };
      let currentState;
      if (needsCommentLoading(options)) {
        await loadComments(page, options);
        currentState = await readLiveInitialState(page);
      }
      return success(
        "\u5E16\u5B50\u8BE6\u60C5\u8BFB\u53D6\u5B8C\u6210",
        parseFeedDetailDocument(page, options, currentState)
      );
    }
    if (task.kind === "get_user_profile") {
      return success(
        "\u7528\u6237\u4E3B\u9875\u8BFB\u53D6\u5B8C\u6210",
        parseUserProfileDocument(page, payloadText(task, "user_id"))
      );
    }
    if (task.kind === "get_my_profile") {
      if (new URL(pageUrl).pathname.includes("/user/profile/")) {
        return success(
          "\u5F53\u524D\u8D26\u53F7\u4E3B\u9875\u8BFB\u53D6\u5B8C\u6210",
          parseUserProfileDocument(page, profileUserId(pageUrl))
        );
      }
      const profileLink = page.querySelector(
        '.main-container .user a[href*="/user/profile/"]'
      );
      if (profileLink?.href) {
        profileLink.click();
        return {
          ok: false,
          message: "\u6B63\u5728\u6253\u5F00\u5F53\u524D\u8D26\u53F7\u4E3B\u9875",
          navigateUrl: profileLink.href
        };
      }
      throw new Error("\u5F53\u524D\u9875\u9762\u6CA1\u6709\u5DF2\u767B\u5F55\u8D26\u53F7\u7684\u4E3B\u9875\u5165\u53E3");
    }
    if (task.kind === "set_like" || task.kind === "set_favorite") {
      const active = payloadBoolean(task, "active");
      return success(
        active ? "\u4E92\u52A8\u72B6\u6001\u5DF2\u542F\u7528" : "\u4E92\u52A8\u72B6\u6001\u5DF2\u53D6\u6D88",
        await setDesiredInteraction(
          page,
          payloadText(task, "feed_id"),
          task.kind === "set_like" ? "like" : "favorite",
          active,
          actions.activateInteraction ? () => actions.activateInteraction?.(
            task.task_id,
            task.kind === "set_like" ? "like" : "favorite"
          ) ?? Promise.resolve() : void 0
        )
      );
    }
    if (task.kind === "post_comment") {
      return success(
        "\u8BC4\u8BBA\u5DF2\u63D0\u4EA4\u5E76\u786E\u8BA4",
        await postComment(
          page,
          payloadText(task, "feed_id"),
          payloadText(task, "content")
        )
      );
    }
    if (task.kind === "reply_comment") {
      return success(
        "\u56DE\u590D\u5DF2\u63D0\u4EA4\u5E76\u786E\u8BA4",
        await replyComment(
          page,
          payloadText(task, "feed_id"),
          payloadText(task, "content"),
          {
            commentId: payloadOptionalText(task, "comment_id"),
            userId: payloadOptionalText(task, "user_id")
          }
        )
      );
    }
    return {
      ok: false,
      message: `\u5F53\u524D\u6269\u5C55\u7248\u672C\u5C1A\u4E0D\u652F\u6301\u4EFB\u52A1 ${task.kind}`,
      result: buildPageCompatibilityDiagnostics(page, pageUrl)
    };
  }
  function success(message, result) {
    return {
      ok: true,
      message,
      result
    };
  }
  async function waitForSearchResult(page, keyword) {
    try {
      const initial = parseFeedListDocument(page, "search", keyword);
      if (initial.items.length) return initial;
    } catch {
    }
    let latest = {};
    for (let attempt = 0; attempt < SEARCH_READY_ATTEMPTS; attempt += 1) {
      latest = await readLiveInitialState(page);
      try {
        const result = parseFeedListDocument(page, "search", keyword, latest);
        if (result.items.length) return result;
      } catch {
      }
      await delay6(SEARCH_READY_INTERVAL_MS);
    }
    return parseFeedListDocument(page, "search", keyword, latest);
  }
  function payloadText(task, field) {
    const value = task.payload[field];
    if (typeof value !== "string" || !value) {
      throw new Error(`\u6D4F\u89C8\u5668\u4EFB\u52A1\u7F3A\u5C11\u53C2\u6570 ${field}`);
    }
    return value;
  }
  function payloadRecord(task, field) {
    const value = task.payload[field];
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }
  function payloadNumber(task, field) {
    const value = task.payload[field];
    if (typeof value !== "number" || !Number.isInteger(value)) {
      throw new Error(`\u6D4F\u89C8\u5668\u4EFB\u52A1\u53C2\u6570 ${field} \u65E0\u6548`);
    }
    return value;
  }
  function payloadBoolean(task, field) {
    const value = task.payload[field];
    if (typeof value !== "boolean") {
      throw new Error(`\u6D4F\u89C8\u5668\u4EFB\u52A1\u53C2\u6570 ${field} \u65E0\u6548`);
    }
    return value;
  }
  function payloadOptionalText(task, field) {
    const value = task.payload[field];
    return typeof value === "string" && value ? value : null;
  }
  function profileUserId(pageUrl) {
    const parts = new URL(pageUrl).pathname.split("/").filter(Boolean);
    if (parts[0] !== "user" || parts[1] !== "profile" || !parts[2]) return null;
    return decodeURIComponent(parts[2]);
  }
  function delay6(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  // src/browser-state-main.ts
  function installBrowserStateBridge(scope = window) {
    const events = browserStateEvents();
    const onRequest = (event) => {
      const requestId = requestIdFromDetail(event.detail);
      if (!requestId) return;
      try {
        const data = stringifyPageState(scope.__INITIAL_STATE__);
        if (!data) throw new Error("\u5C0F\u7EA2\u4E66\u5B9E\u65F6\u72B6\u6001\u5C1A\u672A\u52A0\u8F7D");
        respond(scope, events.response, { requestId, ok: true, data });
      } catch (error) {
        respond(scope, events.response, {
          requestId,
          ok: false,
          message: error instanceof Error ? error.message : "\u5B9E\u65F6\u72B6\u6001\u8BFB\u53D6\u5931\u8D25"
        });
      }
    };
    scope.addEventListener(events.request, onRequest);
    return () => scope.removeEventListener(events.request, onRequest);
  }
  function stringifyPageState(value) {
    const ancestors = [];
    return JSON.stringify(value, function(key, current) {
      if (isVueInternalField(key)) return void 0;
      if (!current || typeof current !== "object") return current;
      while (ancestors.length && ancestors.at(-1) !== this) ancestors.pop();
      if (ancestors.includes(current)) return void 0;
      ancestors.push(current);
      return current;
    });
  }
  function isVueInternalField(key) {
    return key.startsWith("__v_") || key === "dep" || key === "effect";
  }
  function requestIdFromDetail(value) {
    if (typeof value !== "string") return "";
    try {
      const parsed = JSON.parse(value);
      return typeof parsed.requestId === "string" ? parsed.requestId : "";
    } catch {
      return "";
    }
  }
  function respond(scope, eventName, value) {
    scope.dispatchEvent(
      new CustomEvent(eventName, { detail: JSON.stringify(value) })
    );
  }

  // src/managed-page-adapter.ts
  var MANAGED_PAGE_ADAPTER_GLOBAL = "__XHS_DOWNLOADER_MANAGED_PAGE_ADAPTER__";
  var MANAGED_PAGE_ADAPTER_VERSION = "1";
  function installManagedPageAdapter(scope = window) {
    const current = scope.__XHS_DOWNLOADER_MANAGED_PAGE_ADAPTER__;
    if (current?.version === MANAGED_PAGE_ADAPTER_VERSION) return current;
    installBrowserStateBridge(scope);
    const adapter = {
      version: MANAGED_PAGE_ADAPTER_VERSION,
      execute: (task) => executeSafely(task, scope),
      diagnostics: () => buildPageCompatibilityDiagnostics(scope.document, scope.location.href)
    };
    Object.defineProperty(scope, MANAGED_PAGE_ADAPTER_GLOBAL, {
      configurable: true,
      enumerable: false,
      value: adapter,
      writable: false
    });
    return adapter;
  }
  async function executeSafely(task, scope) {
    try {
      return await executeBrowserPageTask(
        task,
        scope.document,
        scope.location.href
      );
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "\u9875\u9762\u6570\u636E\u89E3\u6790\u5931\u8D25",
        status: error instanceof UncertainBrowserActionError ? "needs_review" : "failed",
        result: buildPageCompatibilityDiagnostics(
          scope.document,
          scope.location.href
        )
      };
    }
  }
  installManagedPageAdapter();
})();
