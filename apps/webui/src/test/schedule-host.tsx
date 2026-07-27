import { useState } from "react";

import { PublicationEditor } from "../components/publication-editor";

type EditorProps = Parameters<typeof PublicationEditor>[0];

/**
 * 替发布中心保管计划时间的测试宿主。
 *
 * 计划时间已经提到发布中心按草稿存放，编辑器本身不再持有它；测试要走完
 * "填时间 → 提交"这条路，就得有人接住这次变更。
 *
 * @param properties 编辑器属性，计划时间由本组件提供。
 * @returns 受控计划时间的发布草稿编辑器。
 */
export function ScheduleHost(properties: Omit<EditorProps, "scheduledAt" | "onScheduledAtChange">) {
  const [scheduledAt, setScheduledAt] = useState("");
  return (
    <PublicationEditor
      {...properties}
      onScheduledAtChange={setScheduledAt}
      scheduledAt={scheduledAt}
    />
  );
}
