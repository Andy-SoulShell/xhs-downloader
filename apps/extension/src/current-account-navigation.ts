const CURRENT_USER_CHANNEL_SELECTOR = ".main-container .user .link-wrapper .channel";
const PROFILE_PATH = /^\/user\/profile\/([^/?#]+)\/?$/;

/** 判断账号标识是否满足页面导航允许的长度边界。 */
export function isValidAccountId(value: string): boolean {
  return value.length >= 1 && value.length <= 128;
}

/** 从当前用户导航的同源主页链接读取账号标识。 */
export function readCurrentNavigationAccountId(page: Document): string {
  const channel = page.querySelector(CURRENT_USER_CHANNEL_SELECTOR);
  const link = channel?.closest<HTMLAnchorElement>("a[href]");
  const rawHref = link?.getAttribute("href");
  if (!rawHref) return "";
  try {
    const url = new URL(rawHref, page.baseURI);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "www.xiaohongshu.com" ||
      !["", "443"].includes(url.port)
    ) {
      return "";
    }
    const match = PROFILE_PATH.exec(url.pathname);
    if (!match) return "";
    const accountId = decodeURIComponent(match[1]);
    return isValidAccountId(accountId) ? accountId : "";
  } catch {
    return "";
  }
}
