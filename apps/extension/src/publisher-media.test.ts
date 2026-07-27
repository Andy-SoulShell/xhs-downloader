import { beforeEach, describe, expect, it } from "vitest";

import { waitForMediaReady } from "./publisher-media";

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("发布素材处理状态", () => {
  it("等待视频处理提示消失后再继续", async () => {
    document.body.innerHTML = `
      <div role="status">视频处理中</div>
      <input placeholder="填写标题" />
    `;
    const waiting = waitForMediaReady(document, "video", 100);
    window.setTimeout(() => {
      document.querySelector("[role='status']")?.remove();
    }, 0);

    await expect(waiting).resolves.toBeUndefined();
  });

  it("返回平台展示的视频处理失败原因", async () => {
    document.body.innerHTML = `<div role="alert">视频转码失败，请更换格式</div>`;

    await expect(waitForMediaReady(document, "video", 100)).rejects.toThrow(
      "视频素材处理失败：视频转码失败，请更换格式",
    );
  });

  it("图片无需等待，视频超时给出可操作提示", async () => {
    await expect(waitForMediaReady(document, "image", 1)).resolves.toBeUndefined();
    await expect(waitForMediaReady(document, "video", 1)).rejects.toThrow("视频上传或平台处理超时");
  });
});
