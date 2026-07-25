import type { LoginQrCodeResult } from "@xhs-downloader/contracts";

import { detectLoginState } from "./login-state";

const QR_VALIDITY_MILLISECONDS = 4 * 60 * 1000;
const MAX_QR_DATA_URL_LENGTH = 512_000;
const QR_DATA_PATTERN =
  /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=\r\n]+$/;
const QR_IMAGE_SELECTOR = [
  ".login-container .qrcode-img",
  '.login-container img[class*="qrcode"]',
  '.login-container img[alt*="二维码"]',
].join(",");

/** 从登录页读取短期二维码，不返回页面 Cookie 或其他登录凭据。 */
export function readLoginQrCode(
  page: Document,
  pageUrl: string,
  now = new Date(),
): LoginQrCodeResult {
  if (detectLoginState(page, pageUrl).logged_in) {
    return {
      is_logged_in: true,
      image_data_url: null,
      expires_at: null,
      consumed: false,
    };
  }
  const image = page.querySelector<HTMLImageElement>(QR_IMAGE_SELECTOR);
  const source = image?.currentSrc || image?.getAttribute("src") || "";
  if (
    !source ||
    source.length > MAX_QR_DATA_URL_LENGTH ||
    !QR_DATA_PATTERN.test(source)
  ) {
    throw new Error("登录页没有可安全交付的二维码，请刷新页面后重试");
  }
  return {
    is_logged_in: false,
    image_data_url: source,
    expires_at: new Date(
      now.getTime() + QR_VALIDITY_MILLISECONDS,
    ).toISOString(),
    consumed: false,
  };
}
