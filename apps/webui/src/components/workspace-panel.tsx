import { Tabs } from "radix-ui";
import type { ReactNode } from "react";

import type { WorkspaceView } from "../lib/workspace";

/**
 * 一个常驻的工作台面板。
 *
 * forceMount 让四个工作台切走也不卸载：此前切到别处会连同未保存的设置
 * 修改、正在写的发布草稿和整页浏览结果一起销毁，回来什么都没了，轮询也
 * 跟着停摆。Radix 在 forceMount 下不再自己隐藏，未激活的面板改由
 * data-state 收起，React 状态因此得以保留。
 *
 * @param props 组件属性。
 * @param props.children 面板内容。
 * @param props.value 对应的工作台。
 * @returns 切走不卸载的工作台面板。
 */
export function WorkspacePanel({ children, value }: { children: ReactNode; value: WorkspaceView }) {
  return (
    <Tabs.Content className="data-[state=inactive]:hidden" forceMount value={value}>
      {children}
    </Tabs.Content>
  );
}
