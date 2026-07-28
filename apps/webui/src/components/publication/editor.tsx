import { Save, Trash2 } from "lucide-react";
import { useState } from "react";

import { describeError } from "../../lib/error-message";
import type {
  PublicationDraft,
  PublicationDraftInput,
  PublicationVisibility,
} from "../../lib/publication";
import { normalizePublicationProducts } from "../../lib/publication-editor-rules";
import { autosaveLabel, useDraftAutosave } from "../../lib/use-draft-autosave";
import type { BrowserDriver } from "../../lib/types";
import { ActionButton } from "../action-button";
import { CharacterCount } from "../character-count";
import { ConfirmDialog } from "../confirm-dialog";
import { PublicationAssets } from "./assets";
import { PublicationOptionsForm } from "./options-form";
import { TagInput } from "../tag-input";

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
  /** 上传单个素材；由素材区的队列逐个调用。 */
  onUpload: (file: File) => Promise<void>;
}

const TITLE_LIMIT = 100;
const BODY_LIMIT = 5000;

/**
 * 编辑一份发布草稿的内容。
 *
 * 只管内容：发布落在详情里，发布记录是独立的一列，都不该寄生在表单上。
 */
export function PublicationEditor({
  browserDriver,
  draft,
  onDelete,
  onNotify,
  onRemoveAsset,
  onSave,
  onUpload,
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
  // 素材增删改期间暂停：两条写入并发会互相覆盖。
  const { flush: flushAutosave, state: autosaveState } = useDraftAutosave(
    input(),
    onSave,
    busy === "",
  );
  const run = async (label: string, operation: () => Promise<void>) => {
    setBusy(label);
    try {
      await operation();
    } catch (error) {
      onNotify(describeError(error, "草稿操作失败"));
    } finally {
      setBusy("");
    }
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

      {/* 上传不走 run：整块表单变灰会连正文一起锁上，而队列本来就是为了
          让人边传边改。排序和删除仍要挡住并发写入。 */}
      <PublicationAssets
        busy={Boolean(busy)}
        draft={draft}
        onMove={(order) => run("assets", async () => void (await save(order)))}
        onRemove={(assetId) => run("assets", async () => void (await onRemoveAsset(assetId)))}
        onUpload={onUpload}
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
    </form>
  );
}
