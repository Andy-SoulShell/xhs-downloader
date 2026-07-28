import type { PublicationDraft } from "../../lib/publication";
import { draftTitle } from "../../lib/publication-index";
import { DialogShell } from "../dialog-shell";
import { PublicationEditor } from "./editor";

type EditorProps = Parameters<typeof PublicationEditor>[0];

interface PublicationEditorDialogProps extends EditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 关闭后把焦点还给打开它的按钮。 */
  onRestoreFocus?: () => void;
  draft: PublicationDraft;
}

/**
 * 编辑一份草稿。
 *
 * 表单只在需要改内容时出现，不再常驻半屏。关掉之前挂起的自动保存会在
 * 编辑器卸载时补写，内容不会因为关框而丢。
 */
export function PublicationEditorDialog({
  open,
  onOpenChange,
  onRestoreFocus,
  ...editor
}: PublicationEditorDialogProps) {
  return (
    <DialogShell
      description="改完直接关掉即可，内容会自动保存。"
      onOpenChange={onOpenChange}
      onRestoreFocus={onRestoreFocus}
      open={open}
      title={`编辑「${draftTitle(editor.draft)}」`}
      width="max-w-3xl"
    >
      <PublicationEditor {...editor} />
    </DialogShell>
  );
}
