import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Toast } from "radix-ui";

import { ActivityBoard } from "./components/activity-board";
import { ConnectionPanel } from "./components/connection-panel";
import { ContentBoard } from "./components/content-board";
import { MobileWorkspaceNav } from "./components/mobile-workspace-nav";
import { ProductBrand } from "./components/product-brand";
import { PublicationBoard } from "./components/publication-board";
import { SettingsBoard } from "./components/settings-board";
import { StatusPill } from "./components/status-pill";
import { WorkspaceSidebar } from "./components/workspace-sidebar";
import {
  checkHealth,
  deleteCollectedPost,
  listCollectedPosts,
  submitDetail,
} from "./lib/api";
import { isBrowserDriver } from "./lib/types";
import { useManagedBrowser } from "./lib/use-managed-browser";
import { useSettings } from "./lib/use-settings";
import { usePostDownloads } from "./lib/use-post-downloads";
import { useTaskCenter } from "./lib/use-task-center";
import {
  mergeTaskResults,
  postFromDetail,
  postFromResponse,
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
  const [view, setView] = useState<WorkspaceView>("content");
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
  const managedBrowser = useManagedBrowser();
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
        setNotice(error instanceof Error ? error.message : "读取本地帖子失败");
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
      const post = postFromResponse(result);
      setPosts((current) => [
        post,
        ...current.filter((item) => item.id !== post.id),
      ]);
      setLink("");
      setOnline(true);
      notify(`已添加「${post.result.data?.作品标题 || "未命名帖子"}」`);
    } catch (error) {
      setOnline(false);
      notify(error instanceof Error ? error.message : "解析失败");
    } finally {
      setParsing(false);
    }
  };

  const updatePost = (id: string, change: Partial<PostRecord>) => {
    setPosts((current) =>
      current.map((post) => (post.id === id ? { ...post, ...change } : post)),
    );
  };

  const { downloadFeed, downloadPost } = usePostDownloads({
    createTask,
    notify,
    setOnline,
    setPosts,
    updatePost,
  });

  const handleRetry = async (taskId: string) => {
    try {
      await restartTask(taskId);
      setOnline(true);
      notify("已重新开始下载");
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
          activityCount={tasks.length + records.length}
          completedCount={completedCount}
          filter={filter}
          onFilterChange={setFilter}
          onViewChange={setView}
          online={effectiveOnline}
          postCount={managedPosts.length}
          view={view}
        />

        <MobileHeader online={effectiveOnline} />
        <MobileWorkspaceNav onViewChange={setView} view={view} />

        <main className="px-5 py-6 sm:px-8 lg:ml-60 lg:px-10 lg:py-8">
          <div className="mx-auto max-w-[1460px]">
            {view === "content" && (
              <ContentBoard
                browserDriver={settings?.values.browser_driver}
                completedCount={completedCount}
                filter={filter}
                link={link}
                onDownload={(post) => void downloadPost(post)}
                onDownloadFeed={downloadFeed}
                onFilterChange={setFilter}
                onForceChange={(id, force) => updatePost(id, { force })}
                onLinkChange={setLink}
                onLinkSubmit={handleAdd}
                onQueryChange={setQuery}
                onRemove={(id) => void handleRemove(id)}
                onSelectionChange={(id, selected) =>
                  updatePost(id, { selected })
                }
                parsing={parsing}
                posts={managedPosts}
                query={query}
                visiblePosts={visiblePosts}
              />
            )}
            {view === "activity" && (
              <ActivityBoard
                onRetryDownload={(taskId) => void handleRetry(taskId)}
                records={records}
                tasks={tasks}
              />
            )}
            {view === "publication" && (
              <PublicationBoard browserDriver={settings?.values.browser_driver} onNotify={notify} />
            )}
            {view === "settings" && (
              <>
                <ConnectionPanel
                  account={null}
                  browserDriver={
                    isBrowserDriver(settings?.values.browser_driver)
                      ? settings.values.browser_driver
                      : null
                  }
                  managedBrowser={managedBrowser}
                />
                <SettingsBoard
                  error={settingsError}
                  loading={settingsLoading}
                  onRefresh={() => void refreshSettings()}
                  onSave={saveSettings}
                  onSaved={notify}
                  saving={settingsSaving}
                  settings={settings}
                />
              </>
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
