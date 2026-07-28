import { createContext, useContext } from "react";

import type { usePublicationCenter } from "./use-publication-center";

/** 发布草稿、任务与其上操作的共享读写接口。 */
type PublicationCenter = ReturnType<typeof usePublicationCenter>;

export const PublicationCenterContext = createContext<PublicationCenter | null>(null);

/**
 * 读取共享的发布中心。
 *
 * 侧栏角标要数出有多少次发布等着用户处理，而任务只在发布工作台里取。
 * 各自持有一份会让两处显示不一致，还会按两倍频率轮询本地服务。
 *
 * @returns 当前的草稿、任务与任务操作。
 * @throws 不在 PublicationCenterProvider 内调用时抛出。
 */
export function usePublicationCenterContext(): PublicationCenter {
  const value = useContext(PublicationCenterContext);
  if (!value)
    throw new Error("usePublicationCenterContext 必须在 PublicationCenterProvider 内使用");
  return value;
}
