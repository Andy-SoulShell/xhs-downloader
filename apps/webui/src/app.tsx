import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Tabs, Toast } from "radix-ui";

import { ActivityBoard } from "./components/activity-board";
import { ConnectionPanel } from "./components/connection-panel";
import { ContentBoard } from "./components/content-board";
import { MobileWorkspaceNav } from "./components/mobile-workspace-nav";
import { PublicationBoard } from "./components/publication-board";
import { SettingsBoard } from "./components/settings-board";
import { AppToast } from "./components/app-toast";
import { MobileHeader } from "./components/mobile-header";
import { WorkspaceSidebar } from "./components/workspace-sidebar";
import { checkHealth, deleteCollectedPost, listCollectedPosts, submitDetail } from "./lib/api";
import { isBrowserDriver } from "./lib/types";
import { useManagedBrowser } from "./lib/use-managed-browser";
import { useSettings } from "./lib/use-settings";
import { usePostDownloads } from "./lib/use-post-downloads";
import { useTaskCenter } from "./lib/use-task-center";
import { describeError } from "./lib/error-message";
import { useDownloadCompletion } from "./lib/use-download-completion";
import { useNotice } from "./lib/use-notice";
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
  const { notice, notify, open: toastOpen, setOpen: setToastOpen } = useNotice();
  const {
    createTask,
    error: taskError,
    loading: tasksLoading,
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

  // 递增即重新拉取本地帖子，供服务恢复后的“重试”使用。
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    void listCollectedPosts()
      .then((details) => {
        if (!active) return;
        const restored = details.map(postFromDetail);
        setPosts((current) => [
          ...current,
          ...restored.filter((post) => !current.some((item) => item.id === post.id)),
        ]);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setOnline(false);
        notify(describeError(error, "读取本地帖子失败"), "error");
      });
    return () => {
      active = false;
    };
  }, [notify, reloadKey]);

  useDownloadCompletion(tasks, notify);

  const retryConnection = () => {
    setOnline(null);
    void checkHealth().then(setOnline);
    setReloadKey((key) => key + 1);
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
      setPosts((current) => [post, ...current.filter((item) => item.id !== post.id)]);
      setLink("");
      setOnline(true);
      notify(`已添加「${post.result.data?.作品标题 || "未命名帖子"}」`, "success");
    } catch (error) {
      setOnline(false);
      notify(describeError(error, "解析失败"), "error");
    } finally {
      setParsing(false);
    }
  };

  const updatePost = (id: string, change: Partial<PostRecord>) => {
    setPosts((current) => current.map((post) => (post.id === id ? { ...post, ...change } : post)));
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
      notify(describeError(error, "任务重试失败"), "error");
    }
  };

  const handleRemove = async (id: string) => {
    try {
      await deleteCollectedPost(id);
      setPosts((current) => current.filter((item) => item.id !== id));
      notify("帖子已从列表移除");
    } catch (error) {
      notify(describeError(error, "帖子移除失败"), "error");
    }
  };

  const managedPosts = useMemo(() => mergeTaskResults(posts, tasks), [posts, tasks]);
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

  const completedCount = managedPosts.filter((post) => post.status === "done").length;
  const effectiveOnline = taskError ? false : online;

  return (
    <Toast.Provider swipeDirection="right">
      {/* 四个工作台是同一组标签；侧栏与窄屏标签栏是它的两种排布。 */}
      {/* 手动激活：默认的自动激活会让键盘用户一路 Tab 过去就把工作台换掉，
          既切走了正在看的内容，也永远走不到当前工作台的正文。 */}
      <Tabs.Root
        activationMode="manual"
        asChild
        onValueChange={(next) => setView(next as WorkspaceView)}
        value={view}
      >
        <div className="min-h-screen">
          <WorkspaceSidebar
            activityCount={tasks.length + records.length}
            completedCount={completedCount}
            filter={filter}
            onFilterChange={setFilter}
            online={effectiveOnline}
            postCount={managedPosts.length}
            view={view}
          />

          <MobileHeader online={effectiveOnline} />
          <MobileWorkspaceNav />

          <main className="px-5 py-6 sm:px-8 lg:ml-60 lg:px-10 lg:py-8">
            <div className="mx-auto max-w-[1460px]">
              <Tabs.Content value="content">
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
                  onOpenSettings={() => setView("settings")}
                  onQueryChange={setQuery}
                  onRemove={(id) => void handleRemove(id)}
                  onRetryConnection={retryConnection}
                  online={effectiveOnline}
                  onSelectionChange={(id, selected) => updatePost(id, { selected })}
                  parsing={parsing}
                  posts={managedPosts}
                  query={query}
                  visiblePosts={visiblePosts}
                />
              </Tabs.Content>
              <Tabs.Content value="activity">
                <ActivityBoard
                  loading={tasksLoading}
                  onRetryDownload={(taskId) => void handleRetry(taskId)}
                  records={records}
                  tasks={tasks}
                />
              </Tabs.Content>
              <Tabs.Content value="publication">
                <PublicationBoard
                  browserDriver={settings?.values.browser_driver}
                  onNotify={notify}
                />
              </Tabs.Content>
              <Tabs.Content value="settings">
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
              </Tabs.Content>
            </div>
          </main>
        </div>
      </Tabs.Root>

      <AppToast
        message={notice.message}
        onOpenChange={setToastOpen}
        open={toastOpen}
        tone={notice.tone}
      />
      <Toast.Viewport className="fixed right-4 bottom-4 z-50 w-[calc(100vw-2rem)] max-w-sm outline-none" />
    </Toast.Provider>
  );
}
