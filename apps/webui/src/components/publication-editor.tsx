import { Save, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";

import { autosaveLabel, useDraftAutosave } from "../lib/use-draft-autosave";

import type {
  PublicationDraft,
  PublicationDraftInput,
  PublicationMode,
  PublicationTask,
  PublicationVisibility,
} from "../lib/publication";
import {
  normalizePublicationProducts,
  preparePublicationSubmission,
  publicationCreatorUrl,
  publicationDriverLabel,
  requirePublicationDriver,
  publicationBlockers,
  validatePublicationDraft,
  validatePublicationSchedule,
} from "../lib/publication-editor-rules";
import type { BrowserDriver } from "../lib/types";
import { ConfirmDialog } from "./confirm-dialog";
import { ActionButton } from "./action-button";
import { CharacterCount } from "./character-count";
import { PublicationAssets } from "./publication-assets";
import { TagInput } from "./tag-input";
import { PublicationOptionsForm } from "./publication-options-form";
import { PublicationSubmitControls } from "./publication-submit-controls";
import { describeError } from "../lib/error-message";

interface PublicationEditorProps {
  browserDriver: BrowserDriver;
  draft: PublicationDraft;
  onDelete: () => Promise<void>;
  onNotify: (message: string) => void;
  onRemoveAsset: (assetId: string) => Promise<void>;
  onSave: (
    input: PublicationDraftInput,
    options?: { keepalive?: boolean },
  ) => Promise<PublicationDraft>;
  onSubmitManual: () => Promise<PublicationTask>;
  onSubmitPlatformScheduled: (scheduledAt: string) => Promise<PublicationTask>;
  onSubmitScheduled: (scheduledAt: string) => Promise<PublicationTask>;
  onUpload: (files: File[]) => Promise<void>;
  /**
   * 已选好的计划时间。
   *
   * 由发布中心按草稿保管，而不是留在本组件里：换一份草稿会重建编辑器，
   * 刚挑好的时间不该跟着一起没。它不进草稿模型——后端没有这个字段，
   * 加一个长得像排期却什么都不做的字段比没有更危险。
   */
  scheduledAt: string;
  onScheduledAtChange: (scheduledAt: string) => void;
  /** 这份草稿自己的发布记录，挂在编辑器底部。 */
  timeline?: ReactNode;
}

/** 编辑本地发布草稿，并以二次确认提交三种发布任务。 */
const TITLE_LIMIT = 100;
const BODY_LIMIT = 5000;

export function PublicationEditor({
  browserDriver,
  draft,
  onDelete,
  onNotify,
  onRemoveAsset,
  onSave,
  onSubmitManual,
  onSubmitPlatformScheduled,
  onSubmitScheduled,
  onUpload,
  scheduledAt,
  onScheduledAtChange,
  timeline,
}: PublicationEditorProps) {
  const [title, setTitle] = useState(draft.title);
  const [body, setBody] = useState(draft.body);
  const [tags, setTags] = useState<string[]>(draft.tags);
  const [visibility, setVisibility] = useState<PublicationVisibility>(draft.visibility);
  const [isOriginal, setIsOriginal] = useState(draft.is_original);
  const [products, setProducts] = useState(draft.products.join("\n"));
  const [busy, setBusy] = useState("");
  const hasVideo = draft.assets.some((asset) => asset.media_type.startsWith("video/"));

  const input = (assetOrder?: string[]): PublicationDraftInput => ({
    title: title.trim(),
    body: body.trim(),
    tags,
    visibility,
    is_original: hasVideo ? false : isOriginal,
    products: normalizePublicationProducts(products),
    ...(assetOrder ? { asset_order: assetOrder } : {}),
  });
  const save = async (assetOrder?: string[]) => onSave(input(assetOrder));
  // 自动保存直接交给 onSave：它回传的是自己记下指纹的那份草稿，
  // 若接成 save 会被当作 assetOrder，整份草稿被塞进 asset_order 发出去。
  // 手动提交期间暂停：两条写入并发会互相覆盖。
  const { flush: flushAutosave, state: autosaveState } = useDraftAutosave(
    input(),
    onSave,
    busy === "",
  );
  const submissionInput = () => preparePublicationSubmission(input(), browserDriver);
  const blockers = publicationBlockers(submissionInput(), draft);
  // 提交端点从存储读草稿，所以这次 PUT 必须落库；但落库的是收紧后的内容，
  // 不能同步改回本地表单——改了之后自动保存会一直把空值写回去，
  // 换回浏览器扩展模式时已填的商品全没了。
  const saveSubmission = () => onSave(submissionInput());
  const run = async (label: string, operation: () => Promise<void>) => {
    setBusy(label);
    try {
      await operation();
    } catch (error) {
      onNotify(describeError(error, "发布操作失败"));
    } finally {
      setBusy("");
    }
  };
  const submitBrowserTask = (mode: "manual" | "platform_scheduled") =>
    run(mode, async () => {
      validatePublicationDraft(submissionInput(), draft);
      const platformSchedule =
        mode === "platform_scheduled" ? validatePublicationSchedule(scheduledAt, mode) : undefined;
      const popup = browserDriver === "extension" ? window.open("about:blank", "_blank") : null;
      if (popup) popup.opener = null;
      try {
        await saveSubmission();
        const task =
          mode === "manual"
            ? await onSubmitManual()
            : await onSubmitPlatformScheduled(platformSchedule!);
        const targetDriver = requirePublicationDriver(task.target_driver);
        if (targetDriver === "managed") {
          popup?.close();
          onNotify(
            mode === "manual"
              ? "发布任务已交给软件自带浏览器"
              : "官方定时任务已交给软件自带浏览器设置",
          );
        } else {
          if (popup) {
            popup.location.href = publicationCreatorUrl(task);
            onNotify(mode === "manual" ? "发布任务已交给浏览器扩展" : "官方定时任务已交给扩展设置");
          } else {
            onNotify("扩展任务已就绪，请从任务列表打开创作页");
          }
        }
      } catch (error) {
        popup?.close();
        throw error;
      }
    });
  const submitLocalSchedule = () =>
    run("scheduled", async () => {
      validatePublicationDraft(submissionInput(), draft);
      const schedule = validatePublicationSchedule(scheduledAt, "scheduled");
      await saveSubmission();
      const task = await onSubmitScheduled(schedule);
      onNotify(`本地定时任务已保存，届时由${publicationDriverLabel(task.target_driver)}执行`);
    });
  const submit = (mode: PublicationMode) => {
    if (mode === "scheduled") return submitLocalSchedule();
    return submitBrowserTask(mode);
  };

  return (
    // 离开任一字段就落盘：不必等满防抖时长，用户此时已经写完一段。
    <form
      className="space-y-5"
      onBlur={() => flushAutosave()}
      onSubmit={(event) => event.preventDefault()}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-semibold text-stone-700" htmlFor="publication-title">
            标题
          </label>
          <input
            className="mt-2 h-11 w-full rounded-xl border border-stone-200 bg-white px-3 text-sm font-normal text-stone-900 outline-none transition-all duration-200 focus:border-stone-400 focus:ring-4 focus:ring-stone-900/[0.06]"
            id="publication-title"
            maxLength={TITLE_LIMIT}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="填写发布标题"
            value={title}
          />
          <CharacterCount limit={TITLE_LIMIT} value={title.length} />
        </div>
        <div>
          <span className="block text-xs font-semibold text-stone-700">话题标签</span>
          <TagInput onChange={setTags} tags={tags} />
        </div>
      </div>
      <div>
        <label className="block text-xs font-semibold text-stone-700" htmlFor="publication-body">
          正文
        </label>
        <textarea
          className="mt-2 min-h-36 w-full resize-y rounded-2xl border border-stone-200 bg-white p-4 text-sm leading-6 font-normal text-stone-900 outline-none transition-all duration-200 focus:border-stone-400 focus:ring-4 focus:ring-stone-900/[0.06]"
          id="publication-body"
          maxLength={BODY_LIMIT}
          onChange={(event) => setBody(event.target.value)}
          placeholder="写下准备发布的内容"
          value={body}
        />
        <CharacterCount limit={BODY_LIMIT} value={body.length} />
      </div>

      <PublicationAssets
        busy={Boolean(busy)}
        draft={draft}
        onMove={(order) => run("assets", async () => void (await save(order)))}
        onRemove={(assetId) => run("assets", async () => void (await onRemoveAsset(assetId)))}
        onUpload={(files) => run("assets", async () => void (await onUpload(files)))}
      />

      <PublicationOptionsForm
        browserDriver={browserDriver}
        hasVideo={hasVideo}
        isOriginal={isOriginal}
        onOriginalChange={setIsOriginal}
        onProductsChange={setProducts}
        onVisibilityChange={setVisibility}
        products={products}
        visibility={visibility}
      />

      <PublicationSubmitControls
        blockers={blockers}
        browserDriver={browserDriver}
        busy={busy}
        onScheduledAtChange={onScheduledAtChange}
        onSubmit={submit}
        products={browserDriver === "managed" ? [] : normalizePublicationProducts(products)}
        scheduledAt={scheduledAt}
      />

      {/* 写到一半切走就丢内容是创作界面最不可接受的损失；存没存上要说清楚。 */}
      <p
        aria-live="polite"
        className={`min-h-5 text-xs leading-5 ${
          autosaveState === "failed" ? "text-red-600" : "text-stone-600"
        }`}
      >
        {autosaveLabel(autosaveState)}
      </p>

      <div className="flex flex-wrap justify-between gap-3 border-t border-stone-200 pt-4">
        <ConfirmDialog
          busy={Boolean(busy)}
          confirmLabel="删除草稿"
          description={
            <>
              这份草稿连同 {draft.assets.length} 项素材会一起删掉，删了拿不回来。
              已经提交出去的发布任务不受影响。
            </>
          }
          destructive
          onConfirm={() =>
            void run("delete", async () => {
              await onDelete();
              onNotify("发布草稿已删除");
            })
          }
          title={`删除「${draft.title || "未命名草稿"}」？`}
          trigger={
            <ActionButton disabled={Boolean(busy)} variant="destructive">
              <Trash2 aria-hidden size={14} />
              删除草稿
            </ActionButton>
          }
        />
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

      {timeline}
    </form>
  );
}
