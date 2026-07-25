import { describe, expect, it, vi } from "vitest";

import {
  loadComments,
  needsCommentLoading,
} from "./comment-loader";

describe("详情评论加载器", () => {
  it("在结束标记前展开受限数量的回复", async () => {
    document.body.innerHTML = `
      <div class="comments-container">
        <article class="parent-comment"><button class="show-more">展开回复</button></article>
        <article class="parent-comment"><button class="show-more">展开回复</button></article>
        <div class="end-container"></div>
      </div>
    `;
    const buttons = [...document.querySelectorAll(".show-more")];
    const clicks = buttons.map(() => vi.fn());
    buttons.forEach((button, index) =>
      button.addEventListener("click", clicks[index]),
    );

    await loadComments(document, {
      commentLimit: 20,
      includeReplies: true,
      replyLimit: 1,
    });

    expect(clicks[0]).toHaveBeenCalledOnce();
    expect(clicks[1]).not.toHaveBeenCalled();
  });

  it("首屏读取无需评论区，增强读取要求评论区存在", async () => {
    expect(
      needsCommentLoading({
        commentLimit: 10,
        includeReplies: false,
        replyLimit: 0,
      }),
    ).toBe(false);
    await expect(
      loadComments(document.implementation.createHTMLDocument(), {
        commentLimit: 11,
        includeReplies: false,
        replyLimit: 0,
      }),
    ).rejects.toThrow("评论区尚未加载");
  });

  it("零评论上限直接返回，停滞评论区会停止滚动", async () => {
    await expect(
      loadComments(document, {
        commentLimit: 0,
        includeReplies: true,
        replyLimit: 0,
      }),
    ).resolves.toBeUndefined();
    document.body.innerHTML = `
      <div class="comments-container">
        <article class="parent-comment">
          <button class="show-more">展开回复</button>
        </article>
      </div>
    `;
    vi.stubGlobal("scrollBy", vi.fn());
    vi.useFakeTimers();
    const operation = loadComments(document, {
      commentLimit: 20,
      includeReplies: true,
      replyLimit: 0,
    });
    await vi.runAllTimersAsync();

    await expect(operation).resolves.toBeUndefined();
    expect(
      document.querySelector(".show-more")?.getAttribute("data-xhd-expanded"),
    ).toBeNull();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("等待异步渲染的评论容器后再读取", async () => {
    vi.stubGlobal("scrollBy", vi.fn());
    vi.useFakeTimers();
    const operation = loadComments(document, {
      commentLimit: 1,
      includeReplies: true,
      replyLimit: 1,
    });
    window.setTimeout(() => {
      document.body.innerHTML = `
        <div class="comments-container">
          <article class="parent-comment"></article>
        </div>
      `;
    }, 500);

    await vi.runAllTimersAsync();
    await expect(operation).resolves.toBeUndefined();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
});
