import { afterEach, describe, expect, it } from "vitest";

import type { BrowserTask } from "@xhs-downloader/contracts";

import { executeBrowserPageTask } from "./browser-page-runner";
import { installBrowserStateBridge } from "./browser-state-main";

type TestWindow = Window & { __INITIAL_STATE__?: unknown };

function task(
  kind: BrowserTask["kind"],
  payload: BrowserTask["payload"],
): BrowserTask {
  return {
    task_id: "synthetic-task",
    request_id: "synthetic-request",
    kind,
    payload,
    status: "running",
    result: null,
    extension_id: "synthetic-extension",
    lease_expires_at: "2026-01-01T00:00:00Z",
    attempts: 1,
    message: "合成任务",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

function interactionState(liked: boolean, collected: boolean) {
  return {
    note: {
      noteDetailMap: {
        "synthetic-feed": {
          note: {
            noteId: "synthetic-feed",
            interactInfo: { liked, collected },
          },
        },
      },
    },
  };
}

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
  document.body.innerHTML = "";
  delete (window as TestWindow).__INITIAL_STATE__;
});

describe("页面写任务路由", () => {
  it.each([
    ["set_like" as const, true, false],
    ["set_favorite" as const, false, true],
  ])("执行已经满足目标状态的 %s", async (kind, liked, collected) => {
    const scope = window as TestWindow;
    scope.__INITIAL_STATE__ = interactionState(liked, collected);
    const uninstall = installBrowserStateBridge(scope);

    const response = await executeBrowserPageTask(
      task(kind, {
        feed_id: "synthetic-feed",
        xsec_token: "synthetic-token",
        active: kind === "set_like" ? liked : collected,
      }),
      document,
      "https://www.xiaohongshu.com/explore/synthetic-feed",
    );
    uninstall();

    expect(response.result).toMatchObject({
      feed_id: "synthetic-feed",
      changed: false,
      verified: true,
    });
  });

  it("路由评论提交并返回核验结果", async () => {
    document.body.innerHTML = `
      <div class="comments-container"></div>
      ${editor()}
    `;
    document.querySelector(".submit")?.addEventListener("click", () => {
      const item = document.createElement("article");
      item.className = "parent-comment";
      item.textContent =
        document.querySelector(".content-input")?.textContent ?? "";
      document.querySelector(".comments-container")?.append(item);
    });

    const response = await executeBrowserPageTask(
      task("post_comment", {
        feed_id: "synthetic-feed",
        xsec_token: "synthetic-token",
        content: "合成评论",
      }),
      document,
      "https://www.xiaohongshu.com/explore/synthetic-feed",
    );

    expect(response.message).toBe("评论已提交并确认");
    expect(response.result).toMatchObject({ verified: true });
  });

  it("路由按用户定位的回复并保留空评论 ID", async () => {
    document.body.innerHTML = `
      <div class="comments-container">
        <article class="parent-comment">
          <span data-user-id="synthetic-user"></span>
          <button class="reply">回复</button>
        </article>
      </div>
      ${editor()}
    `;
    document.querySelector(".submit")?.addEventListener("click", () => {
      const item = document.createElement("article");
      item.className = "comment-item";
      item.textContent =
        document.querySelector(".content-input")?.textContent ?? "";
      document.querySelector(".comments-container")?.append(item);
    });

    const response = await executeBrowserPageTask(
      task("reply_comment", {
        feed_id: "synthetic-feed",
        xsec_token: "synthetic-token",
        content: "合成回复",
        comment_id: null,
        user_id: "synthetic-user",
      }),
      document,
      "https://www.xiaohongshu.com/explore/synthetic-feed",
    );

    expect(response.message).toBe("回复已提交并确认");
  });

  it("拒绝非布尔目标状态", async () => {
    await expect(
      executeBrowserPageTask(
        task("set_like", {
          feed_id: "synthetic-feed",
          xsec_token: "synthetic-token",
          active: "true",
        }),
        document,
        "https://www.xiaohongshu.com/explore/synthetic-feed",
      ),
    ).rejects.toThrow("参数 active 无效");
  });
});
