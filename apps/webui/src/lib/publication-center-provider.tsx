import type { ReactNode } from "react";

import { PublicationCenterContext } from "./publication-center";
import { usePublicationCenter } from "./use-publication-center";

/** 在应用根部提供共享的发布中心，使侧栏角标与发布工作台读同一份数据。 */
export function PublicationCenterProvider({ children }: { children: ReactNode }) {
  const center = usePublicationCenter();
  return <PublicationCenterContext value={center}>{children}</PublicationCenterContext>;
}
