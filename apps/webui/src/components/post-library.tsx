import { GalleryVerticalEnd, PlugZap, RefreshCw } from "lucide-react";
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
  filter: Filter;
  posts: PostRecord[];
  visiblePosts: PostRecord[];
  /** 本地服务连通状态；null 表示仍在探测。 */
  online: boolean | null;
  /** 是否正在解析新粘贴的链接。 */
  parsing: boolean;
  onDownload: (post: PostRecord) => void;
  onFilterChange: (filter: Filter) => void;
  onForceChange: (id: string, force: boolean) => void;
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
  filter,
  online,
  parsing,
  posts,
  visiblePosts,
  onDownload,
  onFilterChange,
  onForceChange,
  onRemove,
  onRetryConnection,
  onSelectionChange,
}: PostLibraryProps) {
  return (
    <section aria-label="帖子列表" className="min-w-0">
      {/* 宽屏的筛选在左边栏里，这里只补窄屏那份；计数在页头和左边栏各有一份，
          再在网格上方写第三遍只是噪音，所以这条不再是一整行工具栏。
          lg 以上整块收起，网格直接接住上面的粘贴卡片。 */}
      <SegmentedControl
        ariaLabel="筛选帖子"
        className="mb-4 flex lg:hidden"
        onValueChange={(value) => onFilterChange(value as Filter)}
        value={filter}
      >
        {postFilterItems.map((item) => (
          <SegmentedControlItem key={item.filter} value={item.filter}>
            {item.label}
          </SegmentedControlItem>
        ))}
      </SegmentedControl>

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
