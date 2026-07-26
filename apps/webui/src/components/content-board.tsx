import type { FormEvent } from "react";

import type { Filter, PostRecord } from "../lib/workspace";
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
  onDownload: (post: PostRecord) => void;
  onDownloadFeed: (url: string, title: string) => Promise<void>;
  onFilterChange: (filter: Filter) => void;
  onForceChange: (id: string, force: boolean) => void;
  onLinkChange: (link: string) => void;
  onLinkSubmit: (event: FormEvent) => void;
  onQueryChange: (query: string) => void;
  onRemove: (id: string) => void;
  onSelectionChange: (id: string, selected: Set<number>) => void;
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
  onRemove,
  onSelectionChange,
}: ContentBoardProps) {
  return (
    <>
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
        onSelectionChange={onSelectionChange}
        posts={posts}
        query={query}
        visiblePosts={visiblePosts}
      />
      <BrowserBoard browserDriver={browserDriver} onDownload={onDownloadFeed} />
    </>
  );
}
