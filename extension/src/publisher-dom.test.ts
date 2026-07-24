import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  attachFiles,
  choosePublicationMode,
  fillPublicationForm,
  readPublishOutcome,
  waitForPublishButton,
  waitForPublishOutcome,
  waitForUploadInput,
} from "./publisher-dom";

beforeEach(() => {
  document.body.innerHTML = "";
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("创作页语义适配", () => {
  it("按媒体类型选择创作模式并找到上传入口", async () => {
    const imageTab = document.createElement("button");
    imageTab.textContent = "上传图文";
    const videoTab = document.createElement("button");
    videoTab.textContent = "上传视频";
    document.body.append(imageTab, videoTab);
    const clicked = vi.spyOn(videoTab, "click");

    choosePublicationMode(document, "video");
    window.setTimeout(() => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "video/*";
      document.body.append(input);
    }, 0);
    const input = await waitForUploadInput(document, "video", 100);

    expect(clicked).toHaveBeenCalledOnce();
    expect(input.accept).toBe("video/*");
  });

  it("向文件输入框附加素材并触发标准事件", () => {
    const transferred: File[] = [];
    vi.stubGlobal(
      "DataTransfer",
      class {
        items = { add: (file: File) => transferred.push(file) };
        get files() {
          return transferred as unknown as FileList;
        }
      },
    );
    const input = document.createElement("input");
    input.type = "file";
    const inputEvent = vi.fn();
    const changeEvent = vi.fn();
    input.addEventListener("input", inputEvent);
    input.addEventListener("change", changeEvent);
    const file = new File(["value"], "synthetic.png", { type: "image/png" });

    attachFiles(input, [file]);

    expect(input.files?.[0]).toBe(file);
    expect(inputEvent).toHaveBeenCalledOnce();
    expect(changeEvent).toHaveBeenCalledOnce();
  });

  it("填写受控输入框和富文本正文", async () => {
    document.body.innerHTML = `
      <input placeholder="填写标题" />
      <div class="ProseMirror" contenteditable="true"></div>
    `;
    const title = document.querySelector("input") as HTMLInputElement;
    const body = document.querySelector(".ProseMirror") as HTMLElement;
    const titleInput = vi.fn();
    const bodyInput = vi.fn();
    title.addEventListener("input", titleInput);
    body.addEventListener("input", bodyInput);

    await fillPublicationForm(document, "合成标题", "合成正文", 100);

    expect(title.value).toBe("合成标题");
    expect(body.textContent).toBe("合成正文");
    expect(titleInput).toHaveBeenCalledOnce();
    expect(bodyInput).toHaveBeenCalledOnce();
  });

  it("等待启用的精确发布按钮", async () => {
    document.body.innerHTML = `
      <button>定时发布</button>
      <button id="publish" disabled>发布</button>
    `;
    const button = document.querySelector<HTMLButtonElement>("#publish")!;
    window.setTimeout(() => {
      button.disabled = false;
    }, 0);

    await expect(waitForPublishButton(document, 100)).resolves.toBe(button);
  });

  it("识别成功路径、通知和失败消息", async () => {
    expect(readPublishOutcome(document, "/publish/success")).toEqual({
      status: "published",
      message: "创作平台已确认发布成功",
    });
    document.body.innerHTML = `<div role="alert">发布失败，请重试</div>`;
    expect(readPublishOutcome(document, "/publish")).toEqual({
      status: "failed",
      message: "发布失败，请重试",
    });
    document.body.innerHTML = "";
    window.setTimeout(() => {
      document.body.innerHTML = `<div class="toast">发布成功</div>`;
    }, 0);

    await expect(
      waitForPublishOutcome(document, () => "/publish", 100),
    ).resolves.toEqual({
      status: "published",
      message: "发布成功",
    });
  });

  it("在关键控件始终缺失时返回明确错误", async () => {
    await expect(waitForUploadInput(document, "image", 1)).rejects.toThrow(
      "没有找到创作页素材上传入口",
    );
    await expect(waitForPublishButton(document, 1)).rejects.toThrow(
      "没有找到可用的发布按钮",
    );
  });
});
