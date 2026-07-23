import { describe, expect, it } from "vitest";

import {
  parseCurrentDocument,
  parseInitialStateScript,
} from "./parser";

const WORK_ID = "synthetic000000000000000001";
const SOURCE_URL = `https://www.xiaohongshu.com/explore/${WORK_ID}`;

function stateScript(note: Record<string, unknown>): string {
  return `window.__INITIAL_STATE__=${JSON.stringify({
    note: { noteDetailMap: { [WORK_ID]: { note } } },
  })};`;
}

describe("帖子页面解析", () => {
  it("解析图文、动态图片和作者信息", () => {
    const note = {
      noteId: WORK_ID,
      type: "normal",
      title: "合成测试作品",
      desc: "仅用于自动化测试",
      user: {
        userId: "synthetic-author",
        nickname: "合成作者",
        avatar: "https://example.invalid/avatar.jpeg",
      },
      imageList: [
        {
          urlDefault: (
            "https://sns-webpic-qc.xhscdn.com/" +
            "202607232303/0123456789abcdef0123456789abcdef/" +
            "notes_pre_post/synthetic!nd_dft_wlteh_webp_3"
          ),
          stream: {
            h264: [
              { masterUrl: "https:\\u002F\\u002Fexample.invalid\\u002Flive.mp4" },
            ],
          },
        },
      ],
    };

    const work = parseInitialStateScript(
      stateScript(note),
      SOURCE_URL,
    );

    expect(work.title).toBe("合成测试作品");
    expect(work.authorName).toBe("合成作者");
    expect(work.media).toEqual([
      {
        index: 1,
        kind: "image",
        suffix: "webp",
        url: "https://sns-img-bd.xhscdn.com/notes_pre_post/synthetic",
      },
      {
        index: 1,
        kind: "live",
        previewUrl:
          "https://sns-img-bd.xhscdn.com/notes_pre_post/synthetic",
        suffix: "mp4",
        url: "https://example.invalid/live.mp4",
      },
    ]);
  });

  it("优先使用作品 ID 对应数据并支持 undefined", () => {
    const fallback = {
      noteId: "fallback",
      type: "normal",
      user: { userId: "fallback-author" },
      imageList: [],
    };
    const selected = {
      noteId: WORK_ID,
      type: "normal",
      title: "包含 undefined 文本",
      desc: "undefined 应保留在字符串中",
      user: { userId: "selected-author", nickname: "选中作者" },
      imageList: [
        { url: "https://sns-img-bd.xhscdn.com/synthetic.jpeg" },
      ],
      optional: null,
    };
    const raw = JSON.stringify({
      note: {
        noteDetailMap: {
          fallback: { note: fallback },
          [WORK_ID]: { note: selected },
        },
      },
    }).replace('"optional":null', '"optional":undefined');

    const work = parseInitialStateScript(
      `window.__INITIAL_STATE__=${raw};`,
      SOURCE_URL,
    );

    expect(work.workId).toBe(WORK_ID);
    expect(work.authorName).toBe("选中作者");
    expect(work.description).toContain("undefined");
  });

  it("解析视频备用流和封面", () => {
    const note = {
      noteId: WORK_ID,
      type: "video",
      user: { userId: "synthetic-author" },
      imageList: [
        { url: "https://sns-img-bd.xhscdn.com/synthetic-cover" },
      ],
      video: {
        media: {
          stream: {
            h264: [
              {
                height: 720,
                masterUrl: "https://example.invalid/low.mp4",
              },
              {
                height: 1080,
                backupUrls: ["https://example.invalid/high.mp4"],
              },
            ],
          },
        },
      },
    };

    const work = parseInitialStateScript(stateScript(note), SOURCE_URL);

    expect(work.media[0]).toMatchObject({
      kind: "video",
      url: "https://example.invalid/high.mp4",
      previewUrl: "https://sns-img-bd.xhscdn.com/synthetic-cover",
    });
  });

  it("支持移动端状态、原始视频键与缺失封面", () => {
    const note = {
      noteId: WORK_ID,
      type: "video",
      user: { userId: 42, nickName: "移动端作者", image: "avatar" },
      video: { consumer: { originVideoKey: "folder\\u002Fvideo.mp4" } },
    };
    const script = `window.__INITIAL_STATE__=${JSON.stringify({
      noteData: { data: { noteData: note } },
    })};`;

    const work = parseInitialStateScript(script, SOURCE_URL);

    expect(work.authorName).toBe("移动端作者");
    expect(work.media).toEqual([
      {
        index: 1,
        kind: "video",
        previewUrl: undefined,
        suffix: "mp4",
        url: "https://sns-video-bd.xhscdn.com/folder/video.mp4",
      },
    ]);
  });

  it("忽略无效图片项并保留无封面的动态资源", () => {
    const note = {
      noteId: WORK_ID,
      type: "normal",
      user: { userId: "synthetic-author" },
      imageList: [
        {
          stream: {
            h264: [{ masterUrl: "https://example.invalid/live.mp4" }],
          },
        },
        { url: "https://sns-img-bd.xhscdn.com/synthetic_jpg" },
        { url: "https://sns-img-bd.xhscdn.com/no-suffix" },
        null,
      ],
    };

    const work = parseInitialStateScript(stateScript(note), SOURCE_URL);

    expect(work.media).toMatchObject([
      { index: 1, kind: "live", previewUrl: undefined },
      { index: 2, kind: "image", suffix: "jpeg" },
      { index: 3, kind: "image", suffix: "jpeg" },
    ]);
  });

  it("视频没有有效地址时返回空媒体列表", () => {
    const work = parseInitialStateScript(
      stateScript({
        noteId: WORK_ID,
        type: "video",
        user: { userId: "synthetic-author" },
        imageList: [],
        video: { media: { stream: { h264: [{ height: "invalid" }] } } },
      }),
      SOURCE_URL,
    );

    expect(work.media).toEqual([]);
  });

  it("从页面脚本中选择最后出现的初始状态", () => {
    document.body.innerHTML = `
      <script>window.__INITIAL_STATE__={"note":{}}</script>
      <script>${stateScript({
        noteId: WORK_ID,
        type: "normal",
        user: { userId: "synthetic-author" },
        imageList: [],
      })}</script>
    `;

    expect(parseCurrentDocument(document, SOURCE_URL).workId).toBe(WORK_ID);
  });

  it("拒绝缺少或损坏的初始状态", () => {
    document.body.innerHTML = "<main></main>";
    expect(() => parseCurrentDocument(document, SOURCE_URL)).toThrow(
      "没有可解析",
    );
    expect(() =>
      parseInitialStateScript("window.__INITIAL_STATE__={broken", SOURCE_URL),
    ).toThrow("无法解析");
    expect(() =>
      parseInitialStateScript("window.__INITIAL_STATE__", SOURCE_URL),
    ).toThrow("格式无效");
    expect(() =>
      parseInitialStateScript("window.__INITIAL_STATE__={}", SOURCE_URL),
    ).toThrow("没有可解析");
  });
});
