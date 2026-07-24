/** 服务端与浏览器客户端共享的稳定协议。 */
/** 浏览器扩展与本地服务协商使用的协议版本。 */
export const EXTENSION_PROTOCOL_VERSION = 1;

/** 负责执行媒体下载的一侧。 */
export type DownloadMode = "browser" | "background";

/** 浏览器扩展同步到本地服务的下载结果。 */
export interface ClientDownloadRecord {
  record_id: string;
  work_id: string;
  source_url: string;
  title: string;
  mode: DownloadMode;
  status: "completed" | "failed";
  media_indexes: number[];
  created_at: string;
  message: string;
}
