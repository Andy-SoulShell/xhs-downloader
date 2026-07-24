import { GalleryVerticalEnd, Search } from "lucide-react";
import { ToggleGroup } from "radix-ui";

import type {
  Filter,
  PostRecord,
} from "../lib/workspace";
import { EmptyState } from "./empty-state";
import { PageHeading } from "./page-heading";
import { PostCard } from "./post-card";

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
          <ToggleGroup.Root
            aria-label="筛选帖子"
            className="flex rounded-xl border border-stone-200 bg-white p-1 lg:hidden"
            onValueChange={(value) =>
              value && onFilterChange(value as Filter)
            }
            type="single"
            value={filter}
          >
            <FilterButton value="all">全部</FilterButton>
            <FilterButton value="ready">待处理</FilterButton>
            <FilterButton value="done">已下载</FilterButton>
          </ToggleGroup.Root>
        </div>
        }
        meta={`${posts.length} 个帖子 · ${completedCount} 个已下载`}
        title="帖子列表"
      />

      {visiblePosts.length ? (
        <div
          className={visiblePosts.length <= 5 ? "feed-grid" : "feed-masonry"}
        >
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

function FilterButton({
  value,
  children,
}: {
  value: Filter;
  children: string;
}) {
  return (
    <ToggleGroup.Item
      className="rounded-lg px-3 py-2 text-xs font-medium text-stone-500 outline-none data-[state=on]:bg-stone-900 data-[state=on]:text-white focus:ring-2 focus:ring-stone-300"
      value={value}
    >
      {children}
    </ToggleGroup.Item>
  );
}
