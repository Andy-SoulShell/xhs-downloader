import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Toast } from "radix-ui";

import { LinkComposer } from "./components/link-composer";
import { BrowserBoard } from "./components/browser-board";
import { MobileWorkspaceNav } from "./components/mobile-workspace-nav";
import { PostLibrary } from "./components/post-library";
import { ProductBrand } from "./components/product-brand";
import { PublicationBoard } from "./components/publication-board";
import { SettingsBoard } from "./components/settings-board";
import { RecordBoard, TaskBoard } from "./components/task-center";
import { StatusPill } from "./components/status-pill";
import { WorkspaceSidebar } from "./components/workspace-sidebar";
import {
  checkHealth,
  deleteCollectedPost,
  listCollectedPosts,
  submitDetail,
} from "./lib/api";
import { useSettings } from "./lib/use-settings";
import { useTaskCenter } from "./lib/use-task-center";
import {
  mergeTaskResults,
  postFromDetail,
  type Filter,
  type PostRecord,
  type WorkspaceView,
} from "./lib/workspace";

export default function App() {
  const [online, setOnline] = useState<boolean | null>(null);
  const [posts, setPosts] = useState<PostRecord[]>([]);
  const [link, setLink] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [view, setView] = useState<WorkspaceView>("posts");
  const [parsing, setParsing] = useState(false);
  const [notice, setNotice] = useState("");
  const [toastOpen, setToastOpen] = useState(false);
  const {
    createTask,
    error: taskError,
    records,
    restartTask,
    tasks,
  } = useTaskCenter();
  const {
    error: settingsError,
    loading: settingsLoading,
    refresh: refreshSettings,
    save: saveSettings,
    saving: settingsSaving,
    settings,
  } = useSettings();

  useEffect(() => {
    const controller = new AbortController();
    void checkHealth(controller.signal).then(setOnline);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    let active = true;
    void listCollectedPosts()
      .then((details) => {
        if (!active) return;
        const restored = details.map(postFromDetail);
        setPosts((current) => [
          ...current,
          ...restored.filter(
            (post) => !current.some((item) => item.id === post.id),
          ),
        ]);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setOnline(false);
        setNotice(error instanceof Error ? error.message : "帖子库读取失败");
        setToastOpen(true);
      });
    return () => {
      active = false;
    };
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
      const post: PostRecord = {
        id: result.data.作品ID,
        result,
        selected: new Set(result.data.媒体.map((item) => item.序号)),
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
      const task = await createTask({
        url: detail.作品链接,
        index: [...post.selected].sort((a, b) => a - b),
        force: post.force,
        request_id: crypto.randomUUID(),
      });
      setOnline(true);
      notify(`已提交后台任务 ${task.task_id.slice(0, 8)}`);
    } catch (error) {
      updatePost(post.id, { status: "error" });
      setOnline(false);
      notify(error instanceof Error ? error.message : "下载任务提交失败");
    }
  };

  const handleRetry = async (taskId: string) => {
    try {
      await restartTask(taskId);
      setOnline(true);
      notify("失败任务已重新排队");
    } catch (error) {
      setOnline(false);
      notify(error instanceof Error ? error.message : "任务重试失败");
    }
  };

  const handleRemove = async (id: string) => {
    try {
      await deleteCollectedPost(id);
      setPosts((current) => current.filter((item) => item.id !== id));
      notify("帖子已从列表移除");
    } catch (error) {
      notify(error instanceof Error ? error.message : "帖子移除失败");
    }
  };

  const managedPosts = useMemo(
    () => mergeTaskResults(posts, tasks),
    [posts, tasks],
  );
  const visiblePosts = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return managedPosts.filter((post) => {
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
  }, [filter, managedPosts, query]);

  const completedCount = managedPosts.filter(
    (post) => post.status === "done",
  ).length;
  const effectiveOnline = taskError ? false : online;

  return (
    <Toast.Provider swipeDirection="right">
      <div className="min-h-screen">
        <WorkspaceSidebar
          completedCount={completedCount}
          filter={filter}
          onFilterChange={setFilter}
          onViewChange={setView}
          online={effectiveOnline}
          postCount={managedPosts.length}
          recordCount={records.length}
          taskCount={tasks.length}
          view={view}
        />

        <MobileHeader online={effectiveOnline} />
        <MobileWorkspaceNav onViewChange={setView} view={view} />

        <main className="px-5 py-6 sm:px-8 lg:ml-60 lg:px-10 lg:py-8">
          <div className="mx-auto max-w-[1460px]">
            {view === "posts" && (
              <>
                <LinkComposer
                  link={link}
                  onChange={setLink}
                  onSubmit={handleAdd}
                  parsing={parsing}
                />
                <PostLibrary
                  completedCount={completedCount}
                  filter={filter}
                  onDownload={(post) => void handleDownload(post)}
                  onFilterChange={setFilter}
                  onForceChange={(id, force) => updatePost(id, { force })}
                  onQueryChange={setQuery}
                  onRemove={(id) => void handleRemove(id)}
                  onSelectionChange={(id, selected) =>
                    updatePost(id, { selected })
                  }
                  posts={managedPosts}
                  query={query}
                  visiblePosts={visiblePosts}
                />
              </>
            )}
            {view === "tasks" && (
              <TaskBoard
                onRetry={(taskId) => void handleRetry(taskId)}
                tasks={tasks}
              />
            )}
            {view === "browser" && <BrowserBoard browserDriver={settings?.values.browser_driver} />}
            {view === "publication" && (
              <PublicationBoard onNotify={notify} />
            )}
            {view === "records" && <RecordBoard records={records} />}
            {view === "settings" && (
              <SettingsBoard
                error={settingsError}
                loading={settingsLoading}
                onRefresh={() => void refreshSettings()}
                onSave={saveSettings}
                onSaved={notify}
                saving={settingsSaving}
                settings={settings}
              />
            )}
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

function MobileHeader({ online }: { online: boolean | null }) {
  return (
    <header className="border-b border-stone-200/80 bg-[#f4f1eb]/90 backdrop-blur lg:hidden">
      <div className="flex items-center justify-between px-5 py-4 sm:px-8">
        <ProductBrand compact />
        <StatusPill online={online} />
      </div>
    </header>
  );
}
