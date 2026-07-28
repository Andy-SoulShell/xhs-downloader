import {
  CheckCircle2,
  CircleDashed,
  GalleryVerticalEnd,
  History,
  Send,
  Settings2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { Filter, WorkspaceView } from "../lib/workspace";

interface PostFilterItem {
  filter: Filter;
  icon: LucideIcon;
  label: string;
  sidebarLabel: string;
}

interface WorkspaceViewItem {
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
    label: "未下载",
    sidebarLabel: "未下载",
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
    label: "内容",
    sidebarLabel: "内容",
    view: "content",
  },
  {
    icon: History,
    label: "动态",
    sidebarLabel: "动态",
    view: "activity",
  },
  {
    icon: Send,
    label: "发布",
    sidebarLabel: "发布",
    view: "publication",
  },
  {
    icon: Settings2,
    label: "设置",
    sidebarLabel: "设置",
    view: "settings",
  },
];
