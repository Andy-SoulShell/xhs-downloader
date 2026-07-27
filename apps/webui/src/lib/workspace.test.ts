import { describe, expect, it } from "vitest";

import { makeDetailResponse, makeDownloadTask } from "../test/fixtures";
import { mergeTaskResults, type PostRecord } from "./workspace";

function makePost(): PostRecord {
  return {
    id: "synthetic-work",
    result: makeDetailResponse(),
    selected: new Set([2]),
    downloaded: new Set(),
    force: true,
    status: "ready",
  };
}

describe("任务与帖子状态合并", () => {
  it("用无详情任务更新已有帖子的执行状态", () => {
    const post = makePost();
    const tasks = [
      makeDownloadTask({
        detail: null,
        status: "failed",
        message: "合成任务失败",
      }),
    ];

    const [merged] = mergeTaskResults([post], tasks);

    expect(merged.status).toBe("error");
    expect(merged.result.message).toBe("合成任务失败");
    expect(merged.selected).toBe(post.selected);
  });

  it("从持久化任务恢复帖子和下载产物", () => {
    const task = makeDownloadTask({
      artifacts: [
        {
          path: "download/synthetic.jpeg",
          sha256: "0".repeat(64),
          size: 12,
          media_index: 1,
          kind: "图片",
        },
      ],
    });

    const [restored] = mergeTaskResults([], [task]);

    expect(restored.status).toBe("done");
    expect(restored.downloaded).toEqual(new Set(["1:图片"]));
    expect(restored.selected).toEqual(new Set([1, 2]));
  });

  it("保持已有选择并把排队任务标记为下载中", () => {
    const post = makePost();
    const queued = makeDownloadTask({
      detail: null,
      status: "queued",
    });

    const [merged] = mergeTaskResults([post], [queued]);

    expect(merged.status).toBe("downloading");
    expect(merged.selected).toEqual(new Set([2]));
  });
});
