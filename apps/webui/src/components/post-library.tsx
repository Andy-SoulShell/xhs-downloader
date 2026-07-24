import { GalleryVerticalEnd, Search } from "lucide-react";

import type {
  Filter,
  PostRecord,
} from "../lib/workspace";
import { EmptyState } from "./empty-state";
import { MasonryFeed } from "./masonry-feed";
import { PageHeading } from "./page-heading";
import { PostCard } from "./post-card";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "./segmented-control";
import { postFilterItems } from "./workspace-navigation";

interface PostLibraryProps {
  completedCount: number;
  filter: Filter;
  posts: PostRecord[];
  query: string;
  visiblePosts: PostRecord[];
  onDownload: (post: PostRecord) => void;
  onFilterChange: (filter: Filter) => void;
  onForceChange: (id: string, force: boolean) => void;
  onQueryChange: (query: string) => void;
  onRemove: (id: string) => void;
  onSelectionChange: (id: string, selected: Set<number>) => void;
}

/**
 * 展示可筛选、搜索和操作的帖子列表。
 *
 * @param props 组件属性。
 * @returns 根据结果数量自适应排列的帖子列表或空状态。
 */
export function PostLibrary({
  completedCount,
  filter,
  posts,
  query,
  visiblePosts,
  onDownload,
  onFilterChange,
  onForceChange,
  onQueryChange,
  onRemove,
  onSelectionChange,
}: PostLibraryProps) {
  return (
    <section aria-label="帖子列表" className="mt-8 min-w-0">
      <PageHeading
        actions={
        <div className="flex flex-col gap-3 sm:flex-row">
          <label className="flex h-11 min-w-60 items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 text-stone-400 transition focus-within:border-stone-400 focus-within:ring-4 focus-within:ring-stone-100">
            <Search aria-hidden size={16} />
            <input
              aria-label="搜索帖子"
              className="min-w-0 flex-1 bg-transparent text-sm text-stone-900 outline-none placeholder:text-stone-400"
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="搜索标题或作者"
              type="search"
              value={query}
            />
          </label>
          <SegmentedControl
            ariaLabel="筛选帖子"
            className="flex lg:hidden"
            onValueChange={(value) => onFilterChange(value as Filter)}
            value={filter}
          >
            {postFilterItems.map((item) => (
              <SegmentedControlItem
                key={item.filter}
                value={item.filter}
              >
                {item.label}
              </SegmentedControlItem>
            ))}
          </SegmentedControl>
        </div>
        }
        meta={`${posts.length} 个帖子 · ${completedCount} 个已下载`}
        title="帖子列表"
      />

      {visiblePosts.length ? (
        visiblePosts.length <= 5 ? (
          <div className="feed-grid">
            {visiblePosts.map((post) => (
              <PostCard
                key={post.id}
                onDownload={() => onDownload(post)}
                onForceChange={(force) => onForceChange(post.id, force)}
                onRemove={() => onRemove(post.id)}
                onSelectionChange={(selected) =>
                  onSelectionChange(post.id, selected)
                }
                post={post}
              />
            ))}
          </div>
        ) : (
          <MasonryFeed>
            {visiblePosts.map((post) => (
              <PostCard
                key={post.id}
                onDownload={() => onDownload(post)}
                onForceChange={(force) => onForceChange(post.id, force)}
                onRemove={() => onRemove(post.id)}
                onSelectionChange={(selected) =>
                  onSelectionChange(post.id, selected)
                }
                post={post}
              />
            ))}
          </MasonryFeed>
        )
      ) : (
        <EmptyState
          description={
            posts.length
              ? "换一个关键词或筛选条件试试。"
              : "在上方粘贴链接，解析完成后帖子会出现在这里。"
          }
          icon={GalleryVerticalEnd}
          title={posts.length ? "没有符合条件的帖子" : "帖子列表还是空的"}
        />
      )}
    </section>
  );
}
