import { FormEvent, useEffect, useState } from "react";
import { Switch, Toast, ToggleGroup } from "radix-ui";

import { MediaPicker } from "./components/media-picker";
import { ResultPanel } from "./components/result-panel";
import { StatusPill } from "./components/status-pill";
import { checkHealth, submitDetail } from "./lib/api";
import type { DetailResponse } from "./lib/types";

type Mode = "detail" | "download";

export default function App() {
  const [online, setOnline] = useState<boolean | null>(null);
  const [mode, setMode] = useState<Mode>("detail");
  const [url, setUrl] = useState("");
  const [force, setForce] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [result, setResult] = useState<DetailResponse | null>(null);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const [toastOpen, setToastOpen] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void checkHealth(controller.signal).then(setOnline);
    return () => controller.abort();
  }, []);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const normalizedUrl = url.trim();
    if (!normalizedUrl) {
      setNotice("请先粘贴一个小红书作品链接");
      setToastOpen(true);
      return;
    }

    setPending(true);
    try {
      const response = await submitDetail({
        url: normalizedUrl,
        download: mode === "download",
        index: selected.size ? [...selected].sort((a, b) => a - b) : undefined,
        force,
      });
      setResult(response);
      setOnline(true);
      setNotice(response.message);
      setToastOpen(true);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "请求未能完成");
      setToastOpen(true);
      setOnline(false);
    } finally {
      setPending(false);
    }
  };

  return (
    <Toast.Provider swipeDirection="right">
      <div className="min-h-screen">
        <header className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8 lg:px-10">
          <a
            className="flex items-center gap-3 text-stone-950"
            href="/"
            aria-label="xhs-downloader 首页"
          >
            <span className="grid size-9 place-items-center rounded-xl bg-stone-950 text-sm font-bold text-white">
              x
            </span>
            <span className="text-sm font-semibold tracking-tight">
              xhs-downloader
            </span>
          </a>
          <StatusPill online={online} />
        </header>

        <main className="mx-auto max-w-7xl px-5 pt-10 pb-16 sm:px-8 lg:px-10 lg:pt-16">
          <div className="mb-10 max-w-3xl">
            <p className="mb-4 text-xs font-semibold tracking-[0.22em] text-red-500 uppercase">
              本地媒体工作台 · 3.0
            </p>
            <h1 className="text-4xl leading-[1.08] font-semibold tracking-[-0.04em] text-stone-950 sm:text-6xl lg:text-7xl">
              把收藏，
              <br />
              <span className="text-stone-400">稳稳落到本地。</span>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-stone-600">
              解析作品详情，按需选择媒体，并通过内容指纹与文件哈希确认每一次下载。
            </p>
          </div>

          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)]">
            <section className="control-shell p-5 sm:p-7">
              <ToggleGroup.Root
                aria-label="操作方式"
                className="grid grid-cols-2 rounded-2xl bg-stone-100 p-1"
                type="single"
                value={mode}
                onValueChange={(value) => value && setMode(value as Mode)}
              >
                <ModeButton value="detail">只看详情</ModeButton>
                <ModeButton value="download">下载媒体</ModeButton>
              </ToggleGroup.Root>

              <form className="mt-7" onSubmit={handleSubmit}>
                  <label
                    className="text-xs font-semibold tracking-[0.14em] text-stone-500 uppercase"
                    htmlFor="work-url"
                  >
                    作品链接
                  </label>
                  <textarea
                    id="work-url"
                    className="mt-3 min-h-32 w-full resize-none rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4 text-sm leading-6 text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-stone-500 focus:bg-white focus:ring-4 focus:ring-stone-100"
                    onChange={(event) => setUrl(event.target.value)}
                    placeholder="粘贴 xiaohongshu.com 或 xhslink.cn 链接"
                    value={url}
                  />

                  {mode === "download" && (
                    <>
                      <div className="mt-5 flex items-center justify-between rounded-2xl border border-stone-200 px-4 py-3.5">
                        <div>
                          <p className="text-sm font-medium text-stone-800">
                            强制重新下载
                          </p>
                          <p className="mt-0.5 text-xs text-stone-400">
                            忽略完整的本地产物记录
                          </p>
                        </div>
                        <Switch.Root
                          checked={force}
                          className="relative h-6 w-11 rounded-full bg-stone-200 outline-none transition data-[state=checked]:bg-red-500 focus:ring-4 focus:ring-red-100"
                          onCheckedChange={setForce}
                        >
                          <Switch.Thumb className="block size-5 translate-x-0.5 rounded-full bg-white shadow-sm transition-transform data-[state=checked]:translate-x-5" />
                        </Switch.Root>
                      </div>
                      <MediaPicker
                        media={result?.data?.媒体 ?? []}
                        onChange={setSelected}
                        selected={selected}
                      />
                    </>
                  )}

                  <button
                    className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-red-500 px-5 py-4 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(239,68,68,0.24)] transition hover:-translate-y-0.5 hover:bg-red-600 disabled:cursor-wait disabled:opacity-60 disabled:hover:translate-y-0"
                    disabled={pending}
                    type="submit"
                  >
                    {pending
                      ? "正在处理…"
                      : mode === "download"
                        ? "开始下载"
                        : "解析作品"}
                    {!pending && <span aria-hidden>↗</span>}
                  </button>
              </form>

              <div className="mt-6 flex items-start gap-3 border-t border-stone-100 pt-5 text-xs leading-5 text-stone-400">
                <span className="mt-0.5 text-emerald-500">●</span>
                Cookie、代理与保存目录均由服务端 .env 管理，不会写入浏览器。
              </div>
            </section>

            <ResultPanel result={result} />
          </div>
        </main>

        <footer className="mx-auto flex max-w-7xl flex-col gap-2 border-t border-stone-200 px-5 py-6 text-xs text-stone-400 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-10">
          <span>下载发生在服务端，本页面只负责发起任务与展示结果。</span>
          <span>MIT · ankunhou</span>
        </footer>
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
        <Toast.Description className="mt-1 text-xs text-stone-500">
          {online === false ? "请确认 FastAPI 服务已经启动。" : "操作已完成。"}
        </Toast.Description>
      </Toast.Root>
      <Toast.Viewport className="fixed right-4 bottom-4 z-50 w-[calc(100vw-2rem)] max-w-sm outline-none" />
    </Toast.Provider>
  );
}

function ModeButton({ value, children }: { value: Mode; children: string }) {
  return (
    <ToggleGroup.Item
      className="rounded-xl px-4 py-2.5 text-sm font-medium text-stone-500 outline-none transition data-[state=on]:bg-white data-[state=on]:text-stone-950 data-[state=on]:shadow-sm focus:ring-2 focus:ring-stone-300"
      value={value}
    >
      {children}
    </ToggleGroup.Item>
  );
}
