import { describe, expect, it } from "vitest";

import { parseUserProfileDocument } from "./profile-parser";

function pageWithProfile(
  basicInfo: Record<string, unknown>,
  interactions: unknown[] = [],
): Document {
  const page = document.implementation.createHTMLDocument();
  const script = page.createElement("script");
  script.textContent = `window.__INITIAL_STATE__=${JSON.stringify({
    user: {
      userPageData: { _value: { basicInfo, interactions } },
      notes: { _value: [null, []] },
    },
  })};`;
  page.body.append(script);
  return page;
}

describe("用户资料解析边界", () => {
  it("支持备用字段、请求用户回退和无效统计过滤", () => {
    const alternate = parseUserProfileDocument(
      pageWithProfile(
        {
          user_id: "alternate-user",
          images: "https://example.invalid/avatar.png",
        },
        [
          { name: "", count: "9" },
          { name: "关注", type: "follows" },
        ],
      ),
      "requested-user",
    );
    const requested = parseUserProfileDocument(
      pageWithProfile({ nickname: "合成用户" }),
      "requested-user",
    );
    const anonymous = parseUserProfileDocument(pageWithProfile({ nickname: "匿名用户" }), null);

    expect(alternate).toMatchObject({
      user_id: "alternate-user",
      avatar_url: "https://example.invalid/avatar.png",
      metrics: [{ name: "关注", count: "0", metric_type: "follows" }],
      feeds: [],
    });
    expect(requested.user_id).toBe("requested-user");
    expect(anonymous.user_id).toBeNull();
  });

  it("资料主体缺失时明确失败", () => {
    expect(() => parseUserProfileDocument(pageWithProfile({}, []), null)).toThrow(
      "用户主页资料尚未加载",
    );
  });
});
