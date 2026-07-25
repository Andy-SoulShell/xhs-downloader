import type { CapabilityRoute } from "./browser-api";

/** 将完整路由元数据压缩为普通用户可识别的来源名称。 */
export function capabilityRouteSource(
  route: Pick<CapabilityRoute, "provider" | "browser_driver">,
): string {
  if (route.provider === "http") return "Cookie HTTP";
  if (route.browser_driver === "managed") return "受管浏览器";
  if (route.browser_driver === "extension") return "浏览器扩展";
  return "浏览器";
}
