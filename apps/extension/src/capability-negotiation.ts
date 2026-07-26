import { EXTENSION_PROTOCOL_VERSION } from "@xhs-downloader/contracts";

/** 本地服务在能力协商中声明的协议与特性。 */
export interface ServiceCapabilities {
  protocol_version?: number;
  minimum_extension_protocol?: number;
  features?: Record<string, boolean>;
}

/**
 * 判断本地服务能否与当前扩展构建协作。
 *
 * 同时要求服务协议不低于该能力所需的最低版本，且当前扩展构建不低于
 * 服务要求的最低扩展协议版本；后者让破坏性协议变更在协商阶段就明确
 * 失败，而不是在任务执行中途因字段不匹配而失败。
 *
 * @param payload 能力协商响应。
 * @param minimumServiceProtocol 该能力所需的最低服务协议版本。
 * @param feature 该能力对应的特性开关名称；基础能力可省略。
 */
export function supportsCapability(
  payload: ServiceCapabilities,
  minimumServiceProtocol: number,
  feature?: string,
): boolean {
  if ((payload.protocol_version ?? 0) < minimumServiceProtocol) return false;
  // 旧服务不声明该字段，按兼容当前扩展处理。
  if ((payload.minimum_extension_protocol ?? 0) > EXTENSION_PROTOCOL_VERSION) {
    return false;
  }
  return feature === undefined || payload.features?.[feature] === true;
}
