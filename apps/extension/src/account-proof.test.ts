import { afterEach, describe, expect, it } from "vitest";

import { proveBrowserAccount, type BrowserAccountChallenge } from "./account-proof";
import { installBrowserStateBridge } from "./browser-state-main";

const challenge: BrowserAccountChallenge = {
  challengeId: "0".repeat(32),
  challengeKey: "YWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWE",
};
const scope = window as Window & { __INITIAL_STATE__?: unknown };
let dispose: (() => void) | undefined;

afterEach(() => {
  dispose?.();
  dispose = undefined;
  delete scope.__INITIAL_STATE__;
  document.body.innerHTML = "";
});

describe("浏览器账号一次性证明", () => {
  it("与 Python 固定 HMAC 向量一致且不返回账号标识", async () => {
    scope.__INITIAL_STATE__ = {
      user: {
        userInfo: {
          value: {
            guest: false,
            userId: "synthetic-account-a",
          },
        },
      },
    };
    dispose = installBrowserStateBridge(scope);

    const result = await proveBrowserAccount(document, challenge);

    expect(result).toEqual({
      status: "proved",
      proof: "c8ce2c6973290053f8cabc52b33be8c53f7031abe0ee333886c7ab7ae1f505ca",
    });
    expect(JSON.stringify(result)).not.toContain("synthetic-account-a");
    expect(JSON.stringify(result)).not.toContain(challenge.challengeKey);
  });

  it("只把明确访客判为未登录", async () => {
    scope.__INITIAL_STATE__ = {
      user: { userInfo: { value: { guest: true } } },
    };
    dispose = installBrowserStateBridge(scope);

    await expect(proveBrowserAccount(document, challenge)).resolves.toEqual({
      status: "logged_out",
    });
  });

  it("缺少 guest=false、账号或有效挑战时安全拒绝", async () => {
    scope.__INITIAL_STATE__ = {
      user: { userInfo: { value: { userId: "stale-account" } } },
    };
    dispose = installBrowserStateBridge(scope);

    await expect(proveBrowserAccount(document, challenge)).resolves.toEqual({
      status: "unverified",
    });
    await expect(
      proveBrowserAccount(document, {
        ...challenge,
        challengeId: "invalid",
      }),
    ).resolves.toEqual({ status: "unverified" });
  });

  it("页面水合后只接受当前用户导航中的同源主页标识", async () => {
    document.body.innerHTML = `
      <div class="main-container">
        <div class="user">
          <a class="link-wrapper" href="https://www.xiaohongshu.com/user/profile/synthetic-account-a">
            <span class="channel"></span>
          </a>
        </div>
      </div>
      <a href="/user/profile/untrusted-card-user">普通内容卡片</a>
    `;
    const result = await proveBrowserAccount(document, challenge);

    expect(result).toEqual({
      status: "proved",
      proof: "c8ce2c6973290053f8cabc52b33be8c53f7031abe0ee333886c7ab7ae1f505ca",
    });
    expect(JSON.stringify(result)).not.toContain("synthetic-account-a");
    expect(JSON.stringify(result)).not.toContain("untrusted-card-user");
  });

  it("拒绝当前用户导航中的跨域或非主页链接", async () => {
    document.body.innerHTML = `
      <div class="main-container">
        <div class="user">
          <a class="link-wrapper" href="https://example.com/user/profile/unsafe">
            <span class="channel"></span>
          </a>
        </div>
      </div>
    `;

    await expect(proveBrowserAccount(document, challenge)).resolves.toEqual({
      status: "unverified",
    });
  });
});
