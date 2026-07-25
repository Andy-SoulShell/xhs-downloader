import { afterEach, describe, expect, it, vi } from "vitest";

import { UncertainBrowserActionError } from "./browser-action-errors";
import { postComment, replyComment } from "./comment-runner";

function editor(): string {
  return `
    <div class="input-box">
      <div class="content-edit">
        <span>写评论</span>
        <p class="content-input" contenteditable="true"></p>
      </div>
    </div>
    <div class="bottom"><button class="submit">发送</button></div>
  `;
}

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("评论与回复执行器", () => {
  it("提交评论并通过新增 DOM 节点核验", async () => {
    document.body.innerHTML = `
      <div class="comments-container"><div class="end-container"></div></div>
      ${editor()}
    `;
    document.querySelector(".submit")?.addEventListener("click", () => {
      const comment = document.createElement("article");
      comment.className = "parent-comment";
      comment.id = "comment-new-comment";
      comment.textContent =
        document.querySelector(".content-input")?.textContent ?? "";
      document.querySelector(".comments-container")?.append(comment);
    });

    const result = await postComment(
      document,
      "synthetic-feed",
      "合成评论内容",
    );

    expect(result).toEqual({
      feed_id: "synthetic-feed",
      comment_id: "new-comment",
      verified: true,
    });
  });

  it("按评论 ID 定位并回复", async () => {
    document.body.innerHTML = `
      <div class="comments-container">
        <article class="parent-comment" id="comment-target">
          <div class="interactions"><button class="reply">回复</button></div>
        </article>
      </div>
      ${editor()}
    `;
    const reply = vi.fn();
    document.querySelector(".reply")?.addEventListener("click", reply);
    document.querySelector(".submit")?.addEventListener("click", () => {
      const comment = document.createElement("article");
      comment.className = "comment-item";
      comment.dataset.commentId = "synthetic-reply";
      comment.textContent =
        document.querySelector(".content-input")?.textContent ?? "";
      document.querySelector(".comments-container")?.append(comment);
    });

    const result = await replyComment(
      document,
      "synthetic-feed",
      "合成回复内容",
      { commentId: "target", userId: null },
    );

    expect(reply).toHaveBeenCalledOnce();
    expect(result.comment_id).toBe("synthetic-reply");
  });

  it("无法定位目标时不会填写或提交", async () => {
    document.body.innerHTML = `
      <div class="comments-container"><div class="end-container"></div></div>
      ${editor()}
    `;

    await expect(
      replyComment(document, "synthetic-feed", "合成回复", {
        commentId: null,
        userId: "missing-user",
      }),
    ).rejects.toThrow("没有找到回复目标");
  });

  it("支持按用户定位并拒绝缺失的回复按钮", async () => {
    document.body.innerHTML = `
      <div class="comments-container">
        <article class="parent-comment">
          <span data-user-id="synthetic-user"></span>
        </article>
      </div>
      ${editor()}
    `;

    await expect(
      replyComment(document, "synthetic-feed", "合成回复", {
        commentId: null,
        userId: "synthetic-user",
      }),
    ).rejects.toThrow("没有回复按钮");
  });

  it("滚动加载后继续按评论 ID 查找", async () => {
    document.body.innerHTML = `
      <div class="comments-container"></div>
      ${editor()}
    `;
    vi.stubGlobal(
      "scrollBy",
      vi.fn(() => {
        if (document.querySelector("#comment-late")) return;
        const target = document.createElement("article");
        target.id = "comment-late";
        target.className = "parent-comment";
        target.innerHTML = '<button class="reply">回复</button>';
        document.querySelector(".comments-container")?.append(target);
      }),
    );
    document.querySelector(".submit")?.addEventListener("click", () => {
      const reply = document.createElement("article");
      reply.className = "comment-item";
      reply.textContent =
        document.querySelector(".content-input")?.textContent ?? "";
      document.querySelector(".comments-container")?.append(reply);
    });
    vi.useFakeTimers();
    const operation = replyComment(
      document,
      "synthetic-feed",
      "延迟加载回复",
      { commentId: "late", userId: null },
    );
    await vi.runAllTimersAsync();

    await expect(operation).resolves.toMatchObject({ verified: true });
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("提交前拒绝缺失输入框或不可用按钮", async () => {
    document.body.innerHTML = `
      <div class="comments-container"></div>
      <div class="bottom"><button class="submit">发送</button></div>
    `;
    await expect(
      postComment(document, "synthetic-feed", "合成评论"),
    ).rejects.toThrow("没有可用的评论输入框");

    document.body.innerHTML = `
      <div class="comments-container"></div>
      ${editor()}
    `;
    document.querySelector<HTMLButtonElement>(".submit")!.disabled = true;
    await expect(
      postComment(document, "synthetic-feed", "合成评论"),
    ).rejects.toThrow("提交按钮当前不可用");
  });

  it("提交后无法核验时要求人工核对", async () => {
    document.body.innerHTML = `
      <div class="comments-container"></div>
      ${editor()}
    `;
    vi.useFakeTimers();
    const operation = postComment(document, "synthetic-feed", "无法确认的评论");
    const rejection = expect(operation).rejects.toBeInstanceOf(
      UncertainBrowserActionError,
    );

    await vi.runAllTimersAsync();
    await rejection;
  });
});
