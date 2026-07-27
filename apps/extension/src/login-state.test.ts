import { describe, expect, it } from "vitest";

import { detectLoginState } from "./login-state";

function pageWithState(userInfo: unknown, body = ""): Document {
  const page = document.implementation.createHTMLDocument();
  page.body.innerHTML = body;
  const script = page.createElement("script");
  script.textContent = `window.__INITIAL_STATE__=${JSON.stringify({
    user: { userInfo },
  })}`;
  page.head.append(script);
  return page;
}

describe("浏览器登录状态解析", () => {
  it("从页面初始状态返回当前账号最小信息", () => {
    const page = pageWithState({
      value: {
        guest: false,
        userId: "synthetic-user",
        nickname: "模拟账号",
      },
    });

    expect(detectLoginState(page, "https://www.xiaohongshu.com/explore")).toEqual({
      logged_in: true,
      user_id: "synthetic-user",
      nickname: "模拟账号",
    });
  });

  it("登录页和访客状态不会冒充已登录账号", () => {
    const page = pageWithState(
      { value: { guest: true, userId: "stale-user" } },
      '<div class="login-container"></div>',
    );

    expect(detectLoginState(page, "https://www.xiaohongshu.com/login")).toEqual({
      logged_in: false,
      user_id: null,
      nickname: null,
    });
  });

  it("初始状态缺失时使用同源账号主页导航作为降级证据", () => {
    const page = document.implementation.createHTMLDocument();
    page.head.innerHTML = '<base href="https://www.xiaohongshu.com/explore">';
    page.body.innerHTML = `
      <main class="main-container">
        <div class="user">
          <a class="link-wrapper" href="/user/profile/synthetic-navigation-user">
            <span class="channel"></span>
          </a>
        </div>
      </main>
    `;

    expect(detectLoginState(page, "https://www.xiaohongshu.com/explore")).toEqual({
      logged_in: true,
      user_id: "synthetic-navigation-user",
      nickname: null,
    });
  });

  it("拒绝把无主页地址的导航图标当作登录证据", () => {
    const page = pageWithState(
      { value: { userId: "transient-user" } },
      `
        <main class="main-container">
          <div class="user">
            <a class="link-wrapper"><span class="channel"></span></a>
          </div>
        </main>
      `,
    );

    expect(detectLoginState(page, "https://www.xiaohongshu.com/explore")).toEqual({
      logged_in: false,
      user_id: null,
      nickname: null,
    });
  });

  it("忽略损坏的新脚本并读取较早的有效状态", () => {
    const page = pageWithState({
      guest: false,
      user_id: 42,
      nickName: "模拟备用账号",
    });
    const invalid = page.createElement("script");
    invalid.textContent = "window.__INITIAL_STATE__={invalid";
    page.head.append(invalid);

    expect(detectLoginState(page, "https://www.xiaohongshu.com/explore")).toMatchObject({
      logged_in: true,
      user_id: "42",
      nickname: "模拟备用账号",
    });
  });
});
