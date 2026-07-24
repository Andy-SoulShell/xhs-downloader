import {
  CalendarClock,
  ExternalLink,
  Save,
  Send,
  Trash2,
} from "lucide-react";
import { useState } from "react";

import type {
  PublicationDraft,
  PublicationDraftInput,
  PublicationTask,
} from "../lib/publication";
import { ActionButton } from "./action-button";
import { PublicationAssets } from "./publication-assets";

interface PublicationEditorProps {
  draft: PublicationDraft;
  onDelete: () => Promise<void>;
  onNotify: (message: string) => void;
  onRemoveAsset: (assetId: string) => Promise<void>;
  onSave: (input: PublicationDraftInput) => Promise<PublicationDraft>;
  onSubmitManual: () => Promise<PublicationTask>;
  onSubmitScheduled: (scheduledAt: string) => Promise<PublicationTask>;
  onUpload: (files: File[]) => Promise<void>;
}

export function PublicationEditor({
  draft,
  onDelete,
  onNotify,
  onRemoveAsset,
  onSave,
  onSubmitManual,
  onSubmitScheduled,
  onUpload,
}: PublicationEditorProps) {
  const [title, setTitle] = useState(draft.title);
  const [body, setBody] = useState(draft.body);
  const [tags, setTags] = useState(draft.tags.join(" "));
  const [scheduledAt, setScheduledAt] = useState("");
  const [busy, setBusy] = useState("");

  const input = (assetOrder?: string[]): PublicationDraftInput => ({
    title: title.trim(),
    body: body.trim(),
    tags: parseTags(tags),
    ...(assetOrder ? { asset_order: assetOrder } : {}),
  });
  const save = async (assetOrder?: string[]) => onSave(input(assetOrder));
  const run = async (label: string, operation: () => Promise<void>) => {
    setBusy(label);
    try {
      await operation();
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "发布操作失败");
    } finally {
      setBusy("");
    }
  };
  const submitManual = () =>
    run("manual", async () => {
      validateDraft(input(), draft);
      const popup = window.open("about:blank", "_blank");
      if (popup) popup.opener = null;
      try {
        await save();
        const task = await onSubmitManual();
        if (popup) {
          popup.location.href = creatorUrl(task);
          onNotify("发布任务已交给浏览器扩展");
        } else {
          onNotify("任务已就绪，但浏览器阻止了创作页弹窗");
        }
      } catch (error) {
        popup?.close();
        throw error;
      }
    });
  const submitScheduled = () =>
    run("scheduled", async () => {
      validateDraft(input(), draft);
      const instant = new Date(scheduledAt);
      if (!scheduledAt || !Number.isFinite(instant.getTime())) {
        throw new Error("请选择有效的计划发布时间");
      }
      if (instant.getTime() <= Date.now()) {
        throw new Error("计划发布时间必须晚于当前时间");
      }
      await save();
      await onSubmitScheduled(instant.toISOString());
      onNotify("定时发布任务已保存，届时由浏览器扩展执行");
    });

  return (
    <form className="space-y-5" onSubmit={(event) => event.preventDefault()}>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-xs font-semibold text-stone-700">
          标题
          <input
            className="mt-2 h-11 w-full rounded-xl border border-stone-200 bg-white px-3 text-sm font-normal text-stone-900 outline-none transition focus:border-stone-400 focus:ring-4 focus:ring-stone-100"
            maxLength={100}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="填写发布标题"
            value={title}
          />
        </label>
        <label className="block text-xs font-semibold text-stone-700">
          话题标签
          <input
            className="mt-2 h-11 w-full rounded-xl border border-stone-200 bg-white px-3 text-sm font-normal text-stone-900 outline-none transition focus:border-stone-400 focus:ring-4 focus:ring-stone-100"
            onChange={(event) => setTags(event.target.value)}
            placeholder="用空格分隔，不必输入 #"
            value={tags}
          />
        </label>
      </div>
      <label className="block text-xs font-semibold text-stone-700">
        正文
        <textarea
          className="mt-2 min-h-36 w-full resize-y rounded-2xl border border-stone-200 bg-white p-4 text-sm leading-6 font-normal text-stone-900 outline-none transition focus:border-stone-400 focus:ring-4 focus:ring-stone-100"
          maxLength={5000}
          onChange={(event) => setBody(event.target.value)}
          placeholder="写下准备发布的内容"
          value={body}
        />
      </label>

      <PublicationAssets
        busy={Boolean(busy)}
        draft={draft}
        onMove={(order) => run("assets", async () => void (await save(order)))}
        onRemove={(assetId) =>
          run("assets", async () => void (await onRemoveAsset(assetId)))
        }
        onUpload={(files) =>
          run("assets", async () => void (await onUpload(files)))
        }
      />

      <div className="rounded-2xl border border-stone-200 bg-stone-50/70 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <label className="min-w-0 flex-1 text-xs font-semibold text-stone-700">
            计划发布时间
            <input
              className="mt-2 h-11 w-full rounded-xl border border-stone-200 bg-white px-3 text-sm font-normal text-stone-900 outline-none"
              min={minimumSchedule()}
              onChange={(event) => setScheduledAt(event.target.value)}
              type="datetime-local"
              value={scheduledAt}
            />
          </label>
          <ActionButton
            disabled={Boolean(busy)}
            onClick={() => void submitScheduled()}
            size="large"
            variant="outline"
          >
            <CalendarClock aria-hidden size={16} />
            {busy === "scheduled" ? "正在排期…" : "定时发布"}
          </ActionButton>
          <ActionButton
            disabled={Boolean(busy)}
            onClick={() => void submitManual()}
            size="large"
          >
            <Send aria-hidden size={16} />
            {busy === "manual" ? "正在打开…" : "一键发布"}
            <ExternalLink aria-hidden size={14} />
          </ActionButton>
        </div>
        <p className="mt-3 text-[11px] leading-5 text-stone-500">
          一键发布会打开创作中心；定时发布要求本机服务、浏览器与扩展届时保持运行。
        </p>
      </div>

      <div className="flex flex-wrap justify-between gap-3 border-t border-stone-200 pt-4">
        <ActionButton
          disabled={Boolean(busy)}
          onClick={() =>
            void run("delete", async () => {
              if (!window.confirm("确定删除这份发布草稿吗？")) return;
              await onDelete();
              onNotify("发布草稿已删除");
            })
          }
          variant="ghost"
        >
          <Trash2 aria-hidden size={14} />
          删除草稿
        </ActionButton>
        <ActionButton
          disabled={Boolean(busy)}
          onClick={() =>
            void run("save", async () => {
              await save();
              onNotify("草稿已保存");
            })
          }
          variant="outline"
        >
          <Save aria-hidden size={14} />
          {busy === "save" ? "正在保存…" : "保存草稿"}
        </ActionButton>
      </div>
    </form>
  );
}

function parseTags(value: string): string[] {
  return [...new Set(value.split(/[\s,#，]+/).map((item) => item.trim()))]
    .filter(Boolean)
    .slice(0, 20);
}

function validateDraft(
  input: PublicationDraftInput,
  draft: PublicationDraft,
): void {
  if (!input.title && !input.body) throw new Error("标题和正文不能同时为空");
  if (!draft.assets.length) throw new Error("请至少添加一个发布素材");
}

function creatorUrl(task: PublicationTask): string {
  const url = new URL("https://creator.xiaohongshu.com/publish/publish");
  url.searchParams.set("xhd_task", task.task_id);
  if (task.package.assets[0]?.media_type.startsWith("video/")) {
    url.searchParams.set("target", "video");
  }
  return url.toString();
}

function minimumSchedule(): string {
  const value = new Date(Date.now() + 60_000);
  value.setSeconds(0, 0);
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
