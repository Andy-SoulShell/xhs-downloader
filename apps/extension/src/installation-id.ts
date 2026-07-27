const STORAGE_KEY = "installationId";

/**
 * 读取本安装实例的持久标识，不存在时生成并写回。
 *
 * 未打包扩展的 ID 由目录绝对路径推导，同一个目录在 Chrome 与 Edge 中加载会得到
 * 完全相同的扩展 ID。服务端若只按扩展 ID 存凭据，两个浏览器里的实例会互相顶掉
 * 对方的令牌并陷入登记循环，谁都领不到任务。安装标识把凭据细到实例。
 *
 * @param storage 存放标识的本地存储区。
 * @returns 本安装实例的稳定标识。
 */
export async function resolveInstallationId(
  storage: chrome.storage.StorageArea,
): Promise<string> {
  const stored = await storage.get(STORAGE_KEY);
  const existing = stored?.[STORAGE_KEY];
  if (typeof existing === "string" && existing.length > 0) return existing;
  const created = crypto.randomUUID();
  await storage.set({ [STORAGE_KEY]: created });
  return created;
}
