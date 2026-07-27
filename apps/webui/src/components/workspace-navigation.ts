import {
  CheckCircle2,
  CircleDashed,
  Compass,
  GalleryVerticalEnd,
  History,
  Search,
  Send,
  Settings2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { ContentTab, Filter, WorkspaceView } from "../lib/workspace";

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

export interface ContentTabItem {
  icon: LucideIcon;
  label: string;
  tab: ContentTab;
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

/** 内容工作台顶部分段；三段共用同一套帖子卡片与操作。 */
export const contentTabItems: ContentTabItem[] = [
  { icon: GalleryVerticalEnd, label: "我的帖子", tab: "library" },
  { icon: Compass, label: "推荐", tab: "feeds" },
  { icon: Search, label: "搜索", tab: "search" },
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

export const managementViewItems = workspaceViewItems.filter(({ view }) => view !== "content");
