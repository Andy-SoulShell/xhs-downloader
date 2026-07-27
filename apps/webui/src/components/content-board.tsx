import { Compass, GalleryVerticalEnd } from "lucide-react";
import { useState, type FormEvent } from "react";

import type { Filter, PostRecord } from "../lib/workspace";
import { BoardTabs } from "./board-tabs";
import { PageHeading } from "./page-heading";
import { BrowserBoard } from "./browser-board";
import { LinkComposer } from "./link-composer";
import { PostLibrary } from "./post-library";
import { PostSearch } from "./post-search";

const LIBRARY_TAB = "library";

interface ContentBoardProps {
  browserDriver: unknown;
  headless: boolean;
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

/**
 * 内容工作台：粘贴链接、浏览已采集帖子与实时搜索都在这一页完成。
 *
 * 此前浏览与下载分处两个工作台，用户在浏览里找到的帖子无法直接下载。
 */
export function ContentBoard({
  browserDriver,
  headless,
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
  const [tab, setTab] = useState(LIBRARY_TAB);
  // 搜索只筛我的帖子；浏览小红书时留着它会让人以为能搜到小红书上的内容。
  const searching = tab === LIBRARY_TAB && posts.length > 0;

  return (
    <>
      <PageHeading
        actions={searching ? <PostSearch onQueryChange={onQueryChange} query={query} /> : undefined}
        description="粘贴链接下载，或者直接浏览小红书找内容。"
        meta={posts.length ? `${posts.length} 个帖子` : ""}
        title="内容"
      />
      <BoardTabs
        ariaLabel="内容分类"
        onValueChange={setTab}
        tabs={[
          {
            value: LIBRARY_TAB,
            label: "我的帖子",
            icon: GalleryVerticalEnd,
            count: posts.length,
            content: (
              // 间距取瀑布流的行距：粘贴卡片到首行的距离和卡片之间的一致。
              <div className="space-y-6">
                <LinkComposer
                  link={link}
                  onChange={onLinkChange}
                  onSubmit={onLinkSubmit}
                  parsing={parsing}
                />
                <PostLibrary
                  filter={filter}
                  onDownload={onDownload}
                  onFilterChange={onFilterChange}
                  onForceChange={onForceChange}
                  onRemove={onRemove}
                  onRetryConnection={onRetryConnection}
                  online={online}
                  parsing={parsing}
                  onSelectionChange={onSelectionChange}
                  posts={posts}
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
                headless={headless}
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
