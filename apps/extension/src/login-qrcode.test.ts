import { describe, expect, it } from "vitest";

import { readLoginQrCode, waitForLoginQrCode } from "./login-qrcode";

const QR_DATA_URL = "data:image/png;base64,c3ludGhldGljLXFy";

function loginPage(imageSource = QR_DATA_URL): Document {
  const page = document.implementation.createHTMLDocument();
  page.body.innerHTML = `
    <section class="login-container">
      <img class="qrcode-img" src="${imageSource}" alt="登录二维码">
    </section>
  `;
  return page;
}

describe("登录二维码读取", () => {
  it("只返回短期有效的图片数据", () => {
    const result = readLoginQrCode(
      loginPage(),
      "https://www.xiaohongshu.com/explore",
      new Date("2026-01-01T00:00:00.000Z"),
    );

    expect(result).toEqual({
      is_logged_in: false,
      image_data_url: QR_DATA_URL,
      expires_at: "2026-01-01T00:04:00.000Z",
      consumed: false,
    });
  });

  it("已登录时不返回二维码", () => {
    const page = document.implementation.createHTMLDocument();
    page.head.innerHTML =
      '<base href="https://www.xiaohongshu.com/explore">';
    page.body.innerHTML =
      '<div class="main-container"><div class="user"><a class="link-wrapper" href="/user/profile/synthetic-account"><i class="channel"></i></a></div></div>';

    expect(
      readLoginQrCode(page, "https://www.xiaohongshu.com/explore"),
    ).toEqual({
      is_logged_in: true,
      image_data_url: null,
      expires_at: null,
      consumed: false,
    });
  });

  it("拒绝外部图片地址和缺失二维码", () => {
    expect(() =>
      readLoginQrCode(
        loginPage("https://example.com/qr.png"),
        "https://www.xiaohongshu.com/explore",
      ),
    ).toThrow("没有可安全交付的二维码");
    expect(() =>
      readLoginQrCode(
        document.implementation.createHTMLDocument(),
        "https://www.xiaohongshu.com/explore",
      ),
    ).toThrow("没有可安全交付的二维码");
  });

  it("等待登录页异步生成二维码", async () => {
    const page = document.implementation.createHTMLDocument();
    page.body.innerHTML = '<section class="login-container"></section>';
    const pending = waitForLoginQrCode(
      page,
      "https://www.xiaohongshu.com/explore",
      100,
      2,
    );

    setTimeout(() => {
      const image = page.createElement("img");
      image.className = "qrcode-img";
      image.src = QR_DATA_URL;
      page.querySelector(".login-container")?.append(image);
    }, 10);

    await expect(pending).resolves.toMatchObject({
      is_logged_in: false,
      image_data_url: QR_DATA_URL,
    });
  });
});
