import { afterEach, describe, expect, it, vi } from "vitest";

import {
  cancelPublicationTask,
  createPublicationDraft,
  deletePublicationDraft,
  listPublicationDrafts,
  listPublicationTasks,
  removePublicationAsset,
  resumePublicationVerification,
  reviewPublicationTask,
  retryPublicationTask,
  submitPublicationTask,
  updatePublicationDraft,
  uploadPublicationAsset,
} from "./publication-api";
import { makePublicationDraft, makePublicationTask } from "../test/fixtures";

afterEach(() => vi.unstubAllGlobals());

describe("发布中心 API 客户端", () => {
  it("读取、创建、编辑和删除草稿", async () => {
    const draft = makePublicationDraft();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([draft])))
      .mockResolvedValueOnce(new Response(JSON.stringify(draft)))
      .mockResolvedValueOnce(new Response(JSON.stringify(draft)))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(listPublicationDrafts()).resolves.toEqual([draft]);
    await expect(createPublicationDraft()).resolves.toEqual(draft);
    await expect(
      updatePublicationDraft(draft.draft_id, {
        title: "新标题",
        body: "正文",
        tags: ["标签"],
        visibility: "public",
        is_original: false,
        products: [],
      }),
    ).resolves.toEqual(draft);
    await expect(deletePublicationDraft(draft.draft_id)).resolves.toBeUndefined();

    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      "/api/publication/drafts",
      "/api/publication/drafts",
      "/api/publication/drafts/synthetic-draft",
      "/api/publication/drafts/synthetic-draft",
    ]);
    expect(fetchMock.mock.calls[2][1]).toMatchObject({ method: "PUT" });
  });

  it("上传和删除发布素材", async () => {
    const draft = makePublicationDraft();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(draft)))
      .mockResolvedValueOnce(new Response(JSON.stringify(draft)));
    vi.stubGlobal("fetch", fetchMock);
    const file = new File(["synthetic"], "synthetic.png", {
      type: "image/png",
    });

    await expect(uploadPublicationAsset(draft.draft_id, file)).resolves.toEqual(draft);
    await expect(removePublicationAsset(draft.draft_id, "synthetic-asset")).resolves.toEqual(draft);

    const body = fetchMock.mock.calls[0][1].body as FormData;
    expect(body.get("upload")).toBe(file);
    expect(fetchMock.mock.calls[1][0]).toContain("/assets/synthetic-asset");
  });

  it("提交、读取、核对、重试和取消发布任务", async () => {
    const task = makePublicationTask();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(task)))
      .mockResolvedValueOnce(new Response(JSON.stringify([task])))
      .mockResolvedValueOnce(new Response(JSON.stringify(task)))
      .mockResolvedValueOnce(new Response(JSON.stringify(task)))
      .mockResolvedValueOnce(new Response(JSON.stringify(task)))
      .mockResolvedValueOnce(new Response(JSON.stringify(task)));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      submitPublicationTask("synthetic-draft", "scheduled", "2026-01-02T00:00:00Z"),
    ).resolves.toEqual(task);
    await expect(listPublicationTasks()).resolves.toEqual([task]);
    await expect(retryPublicationTask(task.task_id)).resolves.toEqual(task);
    await expect(reviewPublicationTask(task.task_id, false)).resolves.toEqual(task);
    await expect(reviewPublicationTask(task.task_id, true)).resolves.toEqual(task);
    await expect(cancelPublicationTask(task.task_id)).resolves.toEqual(task);

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      mode: "scheduled",
      scheduled_at: "2026-01-02T00:00:00Z",
    });
    expect(JSON.parse(fetchMock.mock.calls[3][1].body)).toEqual({
      decision: "not_published",
    });
    expect(JSON.parse(fetchMock.mock.calls[4][1].body)).toEqual({
      decision: "published",
    });
  });

  it("只在显式确认后恢复受管浏览器中的原验证任务", async () => {
    const result = {
      task_id: "synthetic-publication-task",
      resumed: true as const,
      publish_attempted: true,
      message: "已确认安全验证完成，受管发布将在原页面继续",
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(result), { status: 202 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: "发布任务当前未等待安全验证" }), {
          status: 409,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(resumePublicationVerification(result.task_id)).resolves.toEqual(result);
    await expect(resumePublicationVerification(result.task_id)).rejects.toThrow(
      "发布任务当前未等待安全验证",
    );

    expect(fetchMock.mock.calls[0][0]).toBe(
      "/api/publication/tasks/synthetic-publication-task/verification/resume",
    );
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      confirmed: true,
    });
  });

  it("保留删除失败的服务端说明", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: "草稿存在活跃任务" }), {
          status: 400,
        }),
      ),
    );

    await expect(deletePublicationDraft("draft")).rejects.toThrow("草稿存在活跃任务");
  });

  it("拒绝发布任务中的未知冻结执行器", async () => {
    const invalid = {
      ...makePublicationTask(),
      target_driver: "future-browser-driver",
    };
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify(invalid)))
        .mockResolvedValueOnce(new Response(JSON.stringify([invalid]))),
    );

    await expect(submitPublicationTask("synthetic-draft", "manual")).rejects.toThrow(
      "发布任务返回了不支持的浏览器执行器",
    );
    await expect(listPublicationTasks()).rejects.toThrow("发布任务返回了不支持的浏览器执行器");
  });
});
