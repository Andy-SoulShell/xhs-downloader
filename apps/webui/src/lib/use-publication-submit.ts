import { useState } from "react";

import { describeError } from "./error-message";
import type {
  PublicationDraft,
  PublicationDraftInput,
  PublicationMode,
  PublicationTask,
} from "./publication";
import {
  preparePublicationSubmission,
  publicationBlockers,
  publicationCreatorUrl,
  publicationDriverLabel,
  requirePublicationDriver,
  validatePublicationSchedule,
} from "./publication-editor-rules";
import type { BrowserDriver } from "./types";

interface PublicationSubmitOptions {
  browserDriver: BrowserDriver;
  draft: PublicationDraft;
  onNotify: (message: string) => void;
  /** 提交前把收紧后的内容落库；提交端点是从存储读草稿的。 */
  onSave: (input: PublicationDraftInput) => Promise<PublicationDraft>;
  onSubmitManual: () => Promise<PublicationTask>;
  onSubmitPlatformScheduled: (scheduledAt: string) => Promise<PublicationTask>;
  onSubmitScheduled: (scheduledAt: string) => Promise<PublicationTask>;
  scheduledAt: string;
}

export interface PublicationSubmit {
  /** 当前挡着发布的问题；非空时不该走到确认那一步。 */
  blockers: string[];
  /** 正在提交的方式，空串表示空闲。 */
  busy: string;
  submit: (mode: PublicationMode) => Promise<void>;
}

/**
 * 把一份草稿提交成发布任务。
 *
 * 从编辑表单里搬出来的：发布不是编辑的附属动作，不编辑也要能发。校验在
 * 渲染期就跑完，按钮据此停用——先吓唬一次再回一句"请至少添加一个素材"，
 * 用完一次用户就学会无脑点确认，真正不可逆的那次也就没了保护。
 *
 * @param options 草稿、连接方式与三种提交回调。
 * @returns 阻塞原因、忙碌状态与提交函数。
 */
export function usePublicationSubmit({
  browserDriver,
  draft,
  onNotify,
  onSave,
  onSubmitManual,
  onSubmitPlatformScheduled,
  onSubmitScheduled,
  scheduledAt,
}: PublicationSubmitOptions): PublicationSubmit {
  const [busy, setBusy] = useState("");
  const submissionInput = () =>
    preparePublicationSubmission(
      {
        title: draft.title,
        body: draft.body,
        tags: draft.tags,
        visibility: draft.visibility,
        is_original: draft.is_original,
        products: draft.products,
      },
      browserDriver,
    );

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
      const platformSchedule =
        mode === "platform_scheduled" ? validatePublicationSchedule(scheduledAt, mode) : undefined;
      // 弹窗必须在用户手势的同一跳里开，等请求回来再开会被浏览器拦掉。
      const popup = browserDriver === "extension" ? window.open("about:blank", "_blank") : null;
      if (popup) popup.opener = null;
      try {
        await onSave(submissionInput());
        const task =
          mode === "manual"
            ? await onSubmitManual()
            : await onSubmitPlatformScheduled(platformSchedule!);
        if (requirePublicationDriver(task.target_driver) === "managed") {
          popup?.close();
          onNotify(
            mode === "manual"
              ? "发布任务已交给软件自带浏览器"
              : "官方定时任务已交给软件自带浏览器设置",
          );
          return;
        }
        if (!popup) {
          onNotify("扩展任务已就绪，请从发布任务里打开创作页");
          return;
        }
        popup.location.href = publicationCreatorUrl(task);
        onNotify(mode === "manual" ? "发布任务已交给浏览器扩展" : "官方定时任务已交给扩展设置");
      } catch (error) {
        popup?.close();
        throw error;
      }
    });

  const submitLocalSchedule = () =>
    run("scheduled", async () => {
      const schedule = validatePublicationSchedule(scheduledAt, "scheduled");
      await onSave(submissionInput());
      const task = await onSubmitScheduled(schedule);
      onNotify(`本地定时任务已保存，届时由${publicationDriverLabel(task.target_driver)}执行`);
    });

  return {
    blockers: publicationBlockers(submissionInput(), draft),
    busy,
    submit: (mode) => (mode === "scheduled" ? submitLocalSchedule() : submitBrowserTask(mode)),
  };
}
