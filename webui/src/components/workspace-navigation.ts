import {
  CheckCircle2,
  CircleDashed,
  GalleryVerticalEnd,
  History,
  ListTodo,
  Send,
  Settings2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { Filter, WorkspaceView } from "../lib/workspace";

export interface PostFilterItem {
  filter: Filter;
  icon: LucideIcon;
  label: string;
  sidebarLabel: string;
}

export interface WorkspaceViewItem {
  icon: LucideIcon;
  label: string;
  sidebarLabel: string;
  view: WorkspaceView;
}

export const postFilterItems: PostFilterItem[] = [
  {
    filter: "all",
    icon: GalleryVerticalEnd,
    label: "全部",
    sidebarLabel: "全部帖子",
  },
  {
    filter: "ready",
    icon: CircleDashed,
    label: "待处理",
    sidebarLabel: "待处理",
  },
  {
    filter: "done",
    icon: CheckCircle2,
    label: "已下载",
    sidebarLabel: "已下载",
  },
];

export const workspaceViewItems: WorkspaceViewItem[] = [
  {
    icon: GalleryVerticalEnd,
    label: "帖子",
    sidebarLabel: "全部帖子",
    view: "posts",
  },
  {
    icon: Send,
    label: "发布",
    sidebarLabel: "发布中心",
    view: "publication",
  },
  {
    icon: ListTodo,
    label: "任务",
    sidebarLabel: "下载任务",
    view: "tasks",
  },
  {
    icon: History,
    label: "记录",
    sidebarLabel: "独立记录",
    view: "records",
  },
  {
    icon: Settings2,
    label: "配置",
    sidebarLabel: "服务配置",
    view: "settings",
  },
];

export const managementViewItems = workspaceViewItems.filter(
  ({ view }) => view !== "posts",
);
