import { beforeEach, describe, expect, it } from "vitest";

import { readPublicationVerification } from "./publisher-verification";

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("创作页安全验证识别", () => {
  it("识别可见的安全验证对话框", () => {
    document.body.innerHTML = `
      <section role="dialog">请完成安全验证后继续</section>
    `;

    expect(readPublicationVerification(document)).toBe(
      "创作平台要求完成安全验证",
    );
  });

  it("忽略隐藏的验证内容和无关文案", () => {
    document.body.innerHTML = `
      <div style="display: none">
        <section role="dialog">请完成安全验证后继续</section>
      </div>
      <section role="alert">验证标题格式后即可发布</section>
    `;

    expect(readPublicationVerification(document)).toBeUndefined();
  });

  it("识别可见的验证码框架", () => {
    document.body.innerHTML = `
      <iframe src="https://synthetic.invalid/captcha"></iframe>
    `;

    expect(readPublicationVerification(document)).toBe(
      "创作平台要求完成安全验证",
    );
  });

  it("忽略明确标记为不可见的验证码框架", () => {
    document.body.innerHTML = `
      <iframe
        src="https://synthetic.invalid/verify"
        aria-hidden="true"
      ></iframe>
    `;

    expect(readPublicationVerification(document)).toBeUndefined();
  });
});
