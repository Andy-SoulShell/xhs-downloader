import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { ArrowDownToLine, GalleryVerticalEnd, Search } from "lucide-react";
import { Toast, ToggleGroup } from "radix-ui";

import { LinkComposer } from "./components/link-composer";
import { PostCard } from "./components/post-card";
import { StatusPill } from "./components/status-pill";
import { WorkspaceSidebar } from "./components/workspace-sidebar";
import { checkHealth, submitDetail } from "./lib/api";
import type { DetailResponse } from "./lib/types";

export type PostStatus = "ready" | "downloading" | "done" | "error";

export interface PostRecord {
  id: string;
  result: DetailResponse;
  selected: Set<number>;
  downloaded: Set<string>;
  force: boolean;
  status: PostStatus;
}

export type Filter = "all" | "ready" | "done";

export default function App() {
  const [online, setOnline] = useState<boolean | null>(null);
  const [posts, setPosts] = useState<PostRecord[]>([]);
  const [link, setLink] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [parsing, setParsing] = useState(false);
  const [notice, setNotice] = useState("");
  const [toastOpen, setToastOpen] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void checkHealth(controller.signal).then(setOnline);
    return () => controller.abort();
  }, []);

  const notify = (message: string) => {
    setNotice(message);
    setToastOpen(true);
  };

  const handleAdd = async (event: FormEvent) => {
    event.preventDefault();
    const url = link.trim();
    if (!url) {
      notify("请先粘贴一个帖子链接");
      return;
    }

    setParsing(true);
    try {
      const result = await submitDetail({ url, download: false });
      if (!result.data) throw new Error("接口没有返回帖子详情");
      const selected = new Set(result.data.媒体.map((item) => item.序号));
      const post: PostRecord = {
        id: result.data.作品ID,
        result,
        selected,
        downloaded: new Set(
          result.files.map((file) => `${file.media_index}:${file.kind}`),
        ),
        force: false,
        status: "ready",
      };
      setPosts((current) => [
        post,
        ...current.filter((item) => item.id !== post.id),
      ]);
      setLink("");
      setOnline(true);
      notify(`已添加「${result.data.作品标题 || "未命名帖子"}」`);
    } catch (error) {
      setOnline(false);
      notify(error instanceof Error ? error.message : "帖子解析失败");
    } finally {
      setParsing(false);
    }
  };

  const updatePost = (id: string, change: Partial<PostRecord>) => {
    setPosts((current) =>
      current.map((post) => (post.id === id ? { ...post, ...change } : post)),
    );
  };

  const handleDownload = async (post: PostRecord) => {
    const detail = post.result.data;
    if (!detail) return;
    if (!post.selected.size) {
      notify("请至少选择一组媒体");
      return;
    }
    updatePost(post.id, { status: "downloading" });
    try {
      const result = await submitDetail({
        url: detail.作品链接,
        download: true,
        index: [...post.selected].sort((a, b) => a - b),
        force: post.force,
      });
      updatePost(post.id, {
        result,
        downloaded: new Set([
          ...post.downloaded,
          ...result.files.map((file) => `${file.media_index}:${file.kind}`),
        ]),
        status: "done",
      });
      setOnline(true);
      notify(result.message);
    } catch (error) {
      updatePost(post.id, { status: "error" });
      setOnline(false);
      notify(error instanceof Error ? error.message : "下载任务失败");
    }
  };

  const visiblePosts = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return posts.filter((post) => {
      const detail = post.result.data;
      if (!detail) return false;
      const matchesFilter =
        filter === "all" ||
        (filter === "done" && post.status === "done") ||
        (filter === "ready" && post.status !== "done");
      const matchesQuery =
        !keyword ||
        detail.作品标题.toLowerCase().includes(keyword) ||
        detail.作者.作者昵称.toLowerCase().includes(keyword);
      return matchesFilter && matchesQuery;
    });
  }, [filter, posts, query]);

  const completedCount = posts.filter((post) => post.status === "done").length;

  return (
    <Toast.Provider swipeDirection="right">
      <div className="min-h-screen">
        <WorkspaceSidebar
          completedCount={completedCount}
          filter={filter}
          onFilterChange={setFilter}
          online={online}
          postCount={posts.length}
        />

        <header className="border-b border-stone-200/80 bg-[#f4f1eb]/90 backdrop-blur lg:hidden">
          <div className="flex items-center justify-between px-5 py-4 sm:px-8">
            <a
              aria-label="xhs-downloader 首页"
              className="flex items-center gap-3 text-stone-950"
              href="/"
            >
              <span className="grid size-9 place-items-center rounded-xl bg-red-500 text-white">
                <ArrowDownToLine aria-hidden size={17} />
              </span>
              <p className="whitespace-nowrap text-xs font-bold tracking-[0.02em]">
                XHS-DOWNLOADER
              </p>
            </a>
            <StatusPill online={online} />
          </div>
        </header>

        <main className="px-5 py-6 sm:px-8 lg:ml-60 lg:px-10 lg:py-8">
          <div className="mx-auto max-w-[1460px]">
            <LinkComposer
              link={link}
              onChange={setLink}
              onSubmit={handleAdd}
              parsing={parsing}
            />

            <section aria-label="帖子列表" className="mt-8 min-w-0">
              <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                <div>
                  <h1 className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-3xl font-semibold tracking-[-0.035em] text-stone-950">
                    <span>帖子列表</span>
                    <span className="text-sm font-normal tracking-normal text-stone-500">
                      {posts.length} 个帖子 · {completedCount} 个已下载
                    </span>
                  </h1>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row">
                  <label className="flex h-11 min-w-60 items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 text-stone-400 transition focus-within:border-stone-400 focus-within:ring-4 focus-within:ring-stone-100">
                    <Search aria-hidden size={16} />
                    <input
                      aria-label="搜索帖子"
                      className="min-w-0 flex-1 bg-transparent text-sm text-stone-900 outline-none placeholder:text-stone-400"
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="搜索标题或作者"
                      type="search"
                      value={query}
                    />
                  </label>
                  <ToggleGroup.Root
                    aria-label="筛选帖子"
                    className="flex rounded-xl border border-stone-200 bg-white p-1 lg:hidden"
                    onValueChange={(value) =>
                      value && setFilter(value as Filter)
                    }
                    type="single"
                    value={filter}
                  >
                    <FilterButton value="all">全部</FilterButton>
                    <FilterButton value="ready">待处理</FilterButton>
                    <FilterButton value="done">已下载</FilterButton>
                  </ToggleGroup.Root>
                </div>
              </div>

              {visiblePosts.length ? (
                <div
                  className={
                    visiblePosts.length <= 5 ? "feed-grid" : "feed-masonry"
                  }
                >
                  {visiblePosts.map((post) => (
                    <PostCard
                      key={post.id}
                      onDownload={() => void handleDownload(post)}
                      onForceChange={(force) => updatePost(post.id, { force })}
                      onRemove={() =>
                        setPosts((current) =>
                          current.filter((item) => item.id !== post.id),
                        )
                      }
                      onSelectionChange={(selected) =>
                        updatePost(post.id, { selected })
                      }
                      post={post}
                    />
                  ))}
                </div>
              ) : (
                <EmptyList hasPosts={posts.length > 0} />
              )}
            </section>
          </div>
        </main>
      </div>

      <Toast.Root
        className="rounded-2xl border border-stone-200 bg-white p-4 shadow-2xl data-[state=open]:animate-[toast-in_180ms_ease-out]"
        duration={3600}
        onOpenChange={setToastOpen}
        open={toastOpen}
      >
        <Toast.Title className="text-sm font-semibold text-stone-900">
          {notice}
        </Toast.Title>
      </Toast.Root>
      <Toast.Viewport className="fixed right-4 bottom-4 z-50 w-[calc(100vw-2rem)] max-w-sm outline-none" />
    </Toast.Provider>
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

function EmptyList({ hasPosts }: { hasPosts: boolean }) {
  return (
    <div className="grid min-h-[420px] place-items-center rounded-3xl border border-dashed border-stone-300 bg-white/45 p-8 text-center">
      <div className="max-w-sm">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-red-50 text-red-500 ring-1 ring-red-100">
          <GalleryVerticalEnd aria-hidden size={22} />
        </span>
        <p className="mt-4 text-lg font-semibold text-stone-800">
          {hasPosts ? "没有符合条件的帖子" : "帖子列表还是空的"}
        </p>
        <p className="mt-2 text-sm leading-6 text-stone-500">
          {hasPosts
            ? "换一个关键词或筛选条件试试。"
            : "在上方粘贴链接，解析完成后帖子会出现在这里。"}
        </p>
      </div>
    </div>
  );
}
