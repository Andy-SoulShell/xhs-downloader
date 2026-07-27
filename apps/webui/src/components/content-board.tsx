import { Compass, GalleryVerticalEnd } from "lucide-react";
import type { CSSProperties, FormEvent } from "react";

import type { Filter, PostRecord } from "../lib/workspace";
import { BoardTabs } from "./board-tabs";
import { PageHeading } from "./page-heading";
import { BrowserBoard } from "./browser-board";
import { LinkComposer } from "./link-composer";
import { PostLibrary } from "./post-library";

interface ContentBoardProps {
  browserDriver: unknown;
  completedCount: number;
  filter: Filter;
  link: string;
  parsing: boolean;
  posts: PostRecord[];
  query: string;
  visiblePosts: PostRecord[];
  /** 本地服务连通状态；null 表示仍在探测。 */
  online: boolean | null;
  onDownload: (post: PostRecord) => void;
  onDownloadFeed: (url: string, title: string) => Promise<void>;
  onFilterChange: (filter: Filter) => void;
  onForceChange: (id: string, force: boolean) => void;
  onLinkChange: (link: string) => void;
  onLinkSubmit: (event: FormEvent) => void;
  onQueryChange: (query: string) => void;
  onRemove: (id: string) => void;
  onOpenSettings: () => void;
  onRetryConnection: () => void;
  onSelectionChange: (id: string, selected: Set<number>) => void;
}

/** 让列宽跟着卡片数走；下限两列保证粘贴框还读得下去，上限五列不再更宽。 */
function contentColumn(cards: number): CSSProperties {
  return {
    "--content-cards": Math.min(Math.max(cards, 2), 5),
  } as CSSProperties;
}

/**
 * 内容工作台：粘贴链接、浏览已采集帖子与实时搜索都在这一页完成。
 *
 * 此前浏览与下载分处两个工作台，用户在浏览里找到的帖子无法直接下载。
 */
export function ContentBoard({
  browserDriver,
  completedCount,
  filter,
  link,
  parsing,
  online,
  posts,
  query,
  visiblePosts,
  onDownload,
  onDownloadFeed,
  onFilterChange,
  onForceChange,
  onLinkChange,
  onLinkSubmit,
  onQueryChange,
  onOpenSettings,
  onRemove,
  onRetryConnection,
  onSelectionChange,
}: ContentBoardProps) {
  return (
    <>
      <PageHeading
        description="粘贴链接下载，或者直接浏览小红书找内容。"
        meta={posts.length ? `${posts.length} 个帖子` : ""}
        title="内容"
      />
      <BoardTabs
        ariaLabel="内容分类"
        tabs={[
          {
            value: "library",
            label: "我的帖子",
            icon: GalleryVerticalEnd,
            count: posts.length,
            content: (
              <div className="content-column" style={contentColumn(visiblePosts.length)}>
                <LinkComposer
                  link={link}
                  onChange={onLinkChange}
                  onSubmit={onLinkSubmit}
                  parsing={parsing}
                />
                <PostLibrary
                  completedCount={completedCount}
                  filter={filter}
                  onDownload={onDownload}
                  onFilterChange={onFilterChange}
                  onForceChange={onForceChange}
                  onQueryChange={onQueryChange}
                  onRemove={onRemove}
                  onRetryConnection={onRetryConnection}
                  online={online}
                  parsing={parsing}
                  onSelectionChange={onSelectionChange}
                  posts={posts}
                  query={query}
                  visiblePosts={visiblePosts}
                />
              </div>
            ),
          },
          {
            value: "browse",
            label: "浏览小红书",
            icon: Compass,
            content: (
              <BrowserBoard
                browserDriver={browserDriver}
                onDownload={onDownloadFeed}
                onOpenSettings={onOpenSettings}
              />
            ),
          },
        ]}
      />
    </>
  );
}
