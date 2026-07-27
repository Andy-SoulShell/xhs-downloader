import { GalleryVerticalEnd, PlugZap, RefreshCw, Search } from "lucide-react";
import type { CSSProperties } from "react";

import { libraryEmptyState } from "../lib/library-empty-state";
import type { Filter, PostRecord } from "../lib/workspace";
import { ActionButton } from "./action-button";
import { EmptyState } from "./empty-state";
import { MasonryFeed } from "./masonry-feed";
import { PostCard } from "./post-card";
import { SkeletonFeedCard } from "./skeleton";
import { SegmentedControl, SegmentedControlItem } from "./segmented-control";
import { postFilterItems } from "./workspace-navigation";

interface PostLibraryProps {
  completedCount: number;
  filter: Filter;
  posts: PostRecord[];
  query: string;
  visiblePosts: PostRecord[];
  /** 本地服务连通状态；null 表示仍在探测。 */
  online: boolean | null;
  /** 是否正在解析新粘贴的链接。 */
  parsing: boolean;
  onDownload: (post: PostRecord) => void;
  onFilterChange: (filter: Filter) => void;
  onForceChange: (id: string, force: boolean) => void;
  onQueryChange: (query: string) => void;
  onRemove: (id: string) => void;
  onRetryConnection: () => void;
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
  online,
  parsing,
  posts,
  query,
  visiblePosts,
  onDownload,
  onFilterChange,
  onForceChange,
  onQueryChange,
  onRemove,
  onRetryConnection,
  onSelectionChange,
}: PostLibraryProps) {
  return (
    <section aria-label="帖子列表" className="min-w-0">
      {/* 标签条已标明这是我的帖子；此处只保留计数与筛选工具，不再重复标题。 */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-stone-600">
          {posts.length ? (
            <>
              共 {posts.length} 个帖子
              {completedCount > 0 && `，已下载 ${completedCount} 个`}
            </>
          ) : (
            "粘贴链接后帖子会保存在这里"
          )}
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <label className="group flex h-11 min-w-60 items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 text-stone-400 transition-all duration-200 focus-within:border-stone-400 focus-within:text-stone-600 focus-within:ring-4 focus-within:ring-stone-900/[0.06]">
            <Search aria-hidden size={16} />
            <input
              aria-label="搜索帖子"
              className="min-w-0 flex-1 bg-transparent text-sm text-stone-900 outline-none placeholder:text-stone-500"
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
              <SegmentedControlItem key={item.filter} value={item.filter}>
                {item.label}
              </SegmentedControlItem>
            ))}
          </SegmentedControl>
        </div>
      </div>

      {parsing && !visiblePosts.length ? (
        <div className="feed-grid">
          <SkeletonFeedCard />
        </div>
      ) : visiblePosts.length ? (
        visiblePosts.length <= 5 ? (
          <div className="feed-grid">
            {parsing && <SkeletonFeedCard />}
            {visiblePosts.map((post, index) => (
              <div key={post.id} style={{ "--enter-index": index } as CSSProperties}>
                <PostCard
                  onDownload={() => onDownload(post)}
                  onForceChange={(force) => onForceChange(post.id, force)}
                  onRemove={() => onRemove(post.id)}
                  onSelectionChange={(selected) => onSelectionChange(post.id, selected)}
                  post={post}
                />
              </div>
            ))}
          </div>
        ) : (
          <MasonryFeed>
            {parsing ? <SkeletonFeedCard /> : null}
            {visiblePosts.map((post) => (
              <PostCard
                key={post.id}
                onDownload={() => onDownload(post)}
                onForceChange={(force) => onForceChange(post.id, force)}
                onRemove={() => onRemove(post.id)}
                onSelectionChange={(selected) => onSelectionChange(post.id, selected)}
                post={post}
              />
            ))}
          </MasonryFeed>
        )
      ) : (
        (() => {
          const empty = libraryEmptyState({ online, totalPosts: posts.length });
          return (
            <EmptyState
              action={
                empty.offline ? (
                  <ActionButton onClick={onRetryConnection} type="button">
                    <RefreshCw aria-hidden size={16} />
                    重试连接
                  </ActionButton>
                ) : undefined
              }
              description={empty.description}
              icon={empty.offline ? PlugZap : GalleryVerticalEnd}
              title={empty.title}
            />
          );
        })()
      )}
    </section>
  );
}
