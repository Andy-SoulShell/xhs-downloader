import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { makePublicationClaim as makeClaim } from "./publication-test-fixtures";

const mocks = vi.hoisted(() => ({
  claim: vi.fn(),
  fetchChunk: vi.fn(),
  register: vi.fn(),
  report: vi.fn(),
  supports: vi.fn(),
  clearActive: vi.fn(),
  clearCredential: vi.fn(),
  ensureCredential: vi.fn(),
  loadActive: vi.fn(),
  loadOwner: vi.fn(),
  loadCredential: vi.fn(),
  saveActive: vi.fn(),
  saveOwner: vi.fn(),
  saveCredential: vi.fn(),
  loadSettings: vi.fn(),
  activateControl: vi.fn(),
  typeSchedule: vi.fn(),
}));
vi.mock("./publication-service", () => ({
  claimPublicationTask: mocks.claim,
  fetchPublicationAssetChunk: mocks.fetchChunk,
  registerPublicationExtension: mocks.register,
  reportPublicationStatus: mocks.report,
  supportsPublication: mocks.supports,
  PublicationUnauthorizedError: class extends Error {},
}));
vi.mock("./publication-storage", () => ({
  clearActivePublicationClaim: mocks.clearActive,
  loadActivePublicationClaim: mocks.loadActive,
  loadActivePublicationOwner: mocks.loadOwner,
  saveActivePublicationClaim: mocks.saveActive,
  saveActivePublicationOwner: mocks.saveOwner,
}));
vi.mock("./extension-credential", () => ({
  clearExtensionCredential: mocks.clearCredential,
  ensureExtensionCredential: mocks.ensureCredential,
}));
vi.mock("./storage", () => ({ loadSettings: mocks.loadSettings }));
vi.mock("./publication-input", () => ({
  activatePublicationControl: mocks.activateControl,
  typePublicationSchedule: mocks.typeSchedule,
}));

import { PublicationUnauthorizedError } from "./publication-service";
import {
  handlePublicationRequest,
  installPublicationAutomation,
} from "./publication-runner";
const credential = { extensionId: "extension", token: "token" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.loadSettings.mockResolvedValue({ serviceUrl: "http://service" });
  mocks.loadActive.mockResolvedValue(undefined);
  mocks.loadOwner.mockResolvedValue(undefined);
  mocks.loadCredential.mockResolvedValue(credential);
  mocks.ensureCredential.mockResolvedValue(credential);
  mocks.register.mockResolvedValue(credential);
  mocks.supports.mockResolvedValue(true);
  vi.stubGlobal("chrome", {
    runtime: {
      id: "extension",
      onInstalled: { addListener: vi.fn() },
      onStartup: { addListener: vi.fn() },
    },
    alarms: {
      create: vi.fn(async () => undefined),
      onAlarm: { addListener: vi.fn() },
    },
    tabs: { create: vi.fn(async () => ({ id: 31 })) },
  });
});

afterEach(() => vi.unstubAllGlobals());

describe("发布任务后台协调器", () => {
  it("领取指定任务并保存活动租约", async () => {
    const claim = makeClaim();
    mocks.claim.mockResolvedValue(claim);
    const response = await handlePublicationRequest({
      type: "publication-prepare",
      preferredTaskId: "task",
    });
    expect(response.claim).toEqual(claim);
    expect(mocks.claim).toHaveBeenCalledWith(
      "http://service",
      credential,
      "task",
    );
    expect(mocks.saveActive).toHaveBeenCalledWith(claim);
  });

  it("复用有效租约并拒绝冲突的手动任务", async () => {
    const claim = makeClaim();
    mocks.loadActive.mockResolvedValue(claim);
    const response = await handlePublicationRequest({
      type: "publication-prepare",
      preferredTaskId: "task",
    });
    expect(response.claim).toEqual(claim);
    expect(mocks.claim).not.toHaveBeenCalled();
    await expect(
      handlePublicationRequest({
        type: "publication-prepare",
        preferredTaskId: "other",
      }),
    ).rejects.toThrow("另一项发布任务");
  });

  it("把租约绑定到首个创作页并拒绝重复标签页", async () => {
    const claim = makeClaim();
    mocks.loadActive.mockResolvedValue(claim);
    mocks.loadOwner.mockResolvedValueOnce(undefined).mockResolvedValueOnce(41);
    await handlePublicationRequest(
      {
        type: "publication-prepare",
        preferredTaskId: "task",
      },
      41,
    );
    expect(mocks.saveOwner).toHaveBeenCalledWith(41);
    await expect(
      handlePublicationRequest(
        {
          type: "publication-prepare",
          preferredTaskId: "task",
        },
        42,
      ),
    ).rejects.toThrow("另一个创作页");
  });

  it("只授权持有租约的创作页提交发布", async () => {
    mocks.loadActive.mockResolvedValue(makeClaim("publishing"));
    mocks.loadOwner.mockResolvedValue(41);
    const response = await handlePublicationRequest(
      {
        type: "publication-activate",
        taskId: "task",
        leaseToken: "lease",
      },
      41,
      "https://creator.xiaohongshu.com/publish/publish",
    );
    expect(response.ok).toBe(true);
    expect(mocks.activateControl).toHaveBeenCalledWith(
      41,
      "https://creator.xiaohongshu.com/publish/publish",
    );
  });

  it("只允许持有租约的创作页填写官方定时时间", async () => {
    mocks.loadActive.mockResolvedValue(makeClaim("filling"));
    mocks.loadOwner.mockResolvedValue(41);

    const response = await handlePublicationRequest(
      {
        type: "publication-schedule-input",
        taskId: "task",
        leaseToken: "lease",
        value: "2026-07-25 16:42",
      },
      41,
      "https://creator.xiaohongshu.com/publish/publish",
    );

    expect(response.ok).toBe(true);
    expect(mocks.typeSchedule).toHaveBeenCalledWith(
      41,
      "2026-07-25 16:42",
      "https://creator.xiaohongshu.com/publish/publish",
    );
  });
  it("清除过期租约并重新领取", async () => {
    mocks.loadActive.mockResolvedValue(
      makeClaim("claimed", new Date(Date.now() - 1_000).toISOString()),
    );
    mocks.claim.mockResolvedValue(makeClaim());

    await handlePublicationRequest({ type: "publication-prepare" });

    expect(mocks.clearActive).toHaveBeenCalledOnce();
    expect(mocks.claim).toHaveBeenCalledOnce();
  });

  it("未授权时重新登记并重试一次", async () => {
    mocks.claim
      .mockRejectedValueOnce(new PublicationUnauthorizedError())
      .mockResolvedValueOnce(makeClaim());

    const response = await handlePublicationRequest({
      type: "publication-prepare",
    });

    expect(response.ok).toBe(true);
    expect(mocks.clearCredential).toHaveBeenCalledOnce();
    expect(mocks.ensureCredential).toHaveBeenCalledWith(
      "http://service",
      mocks.register,
    );
    expect(mocks.ensureCredential).toHaveBeenCalledTimes(2);
    expect(mocks.claim).toHaveBeenCalledTimes(2);
  });

  it("保存进行中状态并在终态清除租约", async () => {
    const filling = makeClaim("filling").task;
    const published = makeClaim("published").task;
    mocks.report
      .mockResolvedValueOnce(filling)
      .mockResolvedValueOnce(published);

    await handlePublicationRequest({
      type: "publication-status",
      taskId: "task",
      leaseToken: "lease",
      status: "filling",
      message: "正在填充",
    });
    await handlePublicationRequest({
      type: "publication-status",
      taskId: "task",
      leaseToken: "lease",
      status: "published",
      message: "发布成功",
    });

    expect(mocks.saveActive).toHaveBeenCalledWith({
      task: filling,
      lease_token: "lease",
    });
    expect(mocks.clearActive).toHaveBeenCalledOnce();
  });

  it("转发受租约保护的素材分段", async () => {
    const chunk = {
      base64: "AA==",
      offset: 0,
      nextOffset: 1,
      total: 1,
      done: true,
    };
    mocks.fetchChunk.mockResolvedValue(chunk);

    const response = await handlePublicationRequest({
      type: "publication-asset-chunk",
      taskId: "task",
      leaseToken: "lease",
      assetId: "asset",
      offset: 0,
    });

    expect(response.chunk).toEqual(chunk);
  });

  it("安装闹钟并只为新领取任务打开一次后台标签", async () => {
    const claim = makeClaim();
    claim.task.package.assets = [
      {
        asset_id: "image",
        filename: "synthetic.png",
        media_type: "image/png",
        size: 1,
        sha256: "b".repeat(64),
        position: 0,
      },
    ];
    mocks.claim.mockResolvedValue(claim);

    installPublicationAutomation();
    const installed = vi.mocked(chrome.runtime.onInstalled.addListener)
      .mock.calls[0][0];
    installed({ reason: "install" });
    await vi.waitFor(() => {
      expect(chrome.tabs.create).toHaveBeenCalledOnce();
    });

    expect(chrome.alarms.create).toHaveBeenCalledWith("publication-poll", {
      delayInMinutes: 0.1,
      periodInMinutes: 0.5,
    });
    expect(chrome.tabs.create).toHaveBeenCalledWith({
      active: false,
      url: expect.stringMatching(
        /^https:\/\/creator\.xiaohongshu\.com\/publish\/publish\?.*xhd_task=task.*target=image/,
      ),
    });
    expect(mocks.saveOwner).toHaveBeenCalledWith(31);
  });
});
