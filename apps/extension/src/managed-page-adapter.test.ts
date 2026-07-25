import { beforeEach, describe, expect, it } from "vitest";

import {
  MANAGED_PAGE_ADAPTER_GLOBAL,
  MANAGED_PAGE_ADAPTER_VERSION,
  installManagedPageAdapter,
  type ManagedPageAdapter,
} from "./managed-page-adapter";
import {
  feedState,
  pageTask,
} from "./browser-page-test-helpers";

type AdapterWindow = Window & {
  __INITIAL_STATE__?: unknown;
  __XHS_DOWNLOADER_MANAGED_PAGE_ADAPTER__?: ManagedPageAdapter;
};

describe("受管浏览器页面适配器", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/explore");
    document.head.innerHTML = "";
    document.body.innerHTML = "";
    delete (window as AdapterWindow).__INITIAL_STATE__;
  });

  it("在主世界安装稳定且幂等的全局入口", () => {
    const scope = window as AdapterWindow;
    const installed = scope.__XHS_DOWNLOADER_MANAGED_PAGE_ADAPTER__;

    expect(MANAGED_PAGE_ADAPTER_GLOBAL).toBe(
      "__XHS_DOWNLOADER_MANAGED_PAGE_ADAPTER__",
    );
    expect(installed?.version).toBe(MANAGED_PAGE_ADAPTER_VERSION);
    expect(installManagedPageAdapter(scope)).toBe(installed);
    expect(typeof installed?.execute).toBe("function");
    expect(typeof installed?.diagnostics).toBe("function");
  });

  it("复用页面执行器和实时状态桥读取搜索结果", async () => {
    const scope = window as AdapterWindow;
    window.history.replaceState({}, "", "/search_result");
    scope.__INITIAL_STATE__ = {
      search: { feeds: { value: [feedState()] } },
    };

    const response =
      await scope.__XHS_DOWNLOADER_MANAGED_PAGE_ADAPTER__?.execute(
        pageTask("search_feeds", {
          keyword: "合成关键词",
          filters: {},
        }),
      );

    expect(response).toMatchObject({
      ok: true,
      result: {
        source: "search",
        items: [{ feed_id: "synthetic-feed" }],
      },
    });
  });

  it("返回脱敏诊断并将执行异常转换为结构化失败", async () => {
    document.body.innerHTML = '<main class="main-container"></main>';
    const adapter = (window as AdapterWindow)
      .__XHS_DOWNLOADER_MANAGED_PAGE_ADAPTER__;

    const response = await adapter?.execute(pageTask("search_feeds"));

    expect(response).toMatchObject({
      ok: false,
      status: "failed",
      message: "浏览器任务缺少参数 keyword",
      result: {
        adapter_version: expect.any(String),
        selector_profile: "semantic-dom-v1",
      },
    });
    expect(adapter?.diagnostics()).toMatchObject({
      adapter_version: expect.any(String),
      matched_anchors: ["main_container"],
    });
  });

  it("互动预检在目标已满足时不请求可信输入", async () => {
    const scope = window as AdapterWindow;
    scope.__INITIAL_STATE__ = interactionState(true, false);
    const adapter = scope.__XHS_DOWNLOADER_MANAGED_PAGE_ADAPTER__;

    const response = await adapter?.prepareInteraction(
      pageTask("set_like", {
        feed_id: "synthetic-feed",
        xsec_token: "synthetic-token",
        active: true,
      }),
    );

    expect(response).toMatchObject({
      ok: true,
      result: {
        feed_id: "synthetic-feed",
        kind: "like",
        active: true,
        changed: false,
        verified: true,
      },
    });
    expect(response?.action).toBeUndefined();
  });

  it("互动预检和可信输入后的回读固定同一任务语义", async () => {
    const scope = window as AdapterWindow;
    scope.__INITIAL_STATE__ = interactionState(false, false);
    document.body.innerHTML = `
      <div class="interact-container">
        <div class="left"><button class="like-lottie"></button></div>
      </div>
    `;
    const adapter = scope.__XHS_DOWNLOADER_MANAGED_PAGE_ADAPTER__;
    const task = pageTask("set_like", {
      feed_id: "synthetic-feed",
      xsec_token: "synthetic-token",
      active: true,
    });

    const preparation = await adapter?.prepareInteraction(task);
    scope.__INITIAL_STATE__ = interactionState(true, false);
    const verification = await adapter?.verifyInteraction(task);

    expect(preparation).toMatchObject({
      ok: false,
      action: {
        task_id: task.task_id,
        feed_id: "synthetic-feed",
        kind: "like",
        active: true,
        selector: ".interact-container .left .like-lottie",
      },
    });
    expect(verification).toMatchObject({
      ok: true,
      result: {
        feed_id: "synthetic-feed",
        kind: "like",
        active: true,
        changed: true,
        verified: true,
      },
    });
  });

  it("通用入口拒绝绕过受管浏览器可信互动流程", async () => {
    const adapter = (window as AdapterWindow)
      .__XHS_DOWNLOADER_MANAGED_PAGE_ADAPTER__;

    const response = await adapter?.execute(
      pageTask("set_favorite", {
        feed_id: "synthetic-feed",
        xsec_token: "synthetic-token",
        active: true,
      }),
    );

    expect(response).toMatchObject({
      ok: false,
      status: "failed",
      message: "受管浏览器互动必须通过可信输入流程执行",
    });
  });
});

function interactionState(liked: boolean, collected: boolean): object {
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
