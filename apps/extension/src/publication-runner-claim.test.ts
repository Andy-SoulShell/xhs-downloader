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
  saveActive: vi.fn(),
  saveOwner: vi.fn(),
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
import { handlePublicationRequest } from "./publication-runner";
const credential = { extensionId: "extension", token: "token" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.loadSettings.mockResolvedValue({ serviceUrl: "http://service" });
  mocks.loadActive.mockResolvedValue(undefined);
  mocks.loadOwner.mockResolvedValue(undefined);
  mocks.ensureCredential.mockResolvedValue(credential);
  mocks.register.mockResolvedValue(credential);
  mocks.supports.mockResolvedValue(true);
});

afterEach(() => vi.unstubAllGlobals());

describe("发布任务领取与归属", () => {
  it("领取指定任务并保存活动租约", async () => {
    const claim = makeClaim();
    mocks.claim.mockResolvedValue(claim);
    const response = await handlePublicationRequest({
      type: "publication-prepare",
      preferredTaskId: "task",
    });
    expect(response.claim).toEqual(claim);
    expect(mocks.claim).toHaveBeenCalledWith("http://service", credential, "task");
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

  it("清除过期租约并重新领取", async () => {
    mocks.loadActive.mockResolvedValue(
      makeClaim("claimed", new Date(Date.now() - 1_000).toISOString()),
    );
    mocks.claim.mockResolvedValue(makeClaim());

    await handlePublicationRequest({
      type: "publication-prepare",
      preferredTaskId: "task",
    });

    expect(mocks.clearActive).toHaveBeenCalledOnce();
    expect(mocks.claim).toHaveBeenCalledOnce();
  });

  it("页面未指名任务时不领取新任务", async () => {
    mocks.claim.mockResolvedValue(makeClaim());

    const response = await handlePublicationRequest({ type: "publication-prepare" }, 41);

    expect(response.ok).toBe(false);
    expect(response.claim).toBeUndefined();
    expect(mocks.claim).not.toHaveBeenCalled();
  });

  it("页面未指名任务时仅归属标签页可恢复租约", async () => {
    const claim = makeClaim("publishing");
    mocks.loadActive.mockResolvedValue(claim);
    mocks.loadOwner.mockResolvedValue(41);

    const owned = await handlePublicationRequest({ type: "publication-prepare" }, 41);
    expect(owned.claim).toEqual(claim);

    mocks.loadOwner.mockResolvedValue(undefined);
    const anonymous = await handlePublicationRequest({ type: "publication-prepare" }, 52);
    expect(anonymous.ok).toBe(false);
    expect(anonymous.claim).toBeUndefined();
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.saveOwner).not.toHaveBeenCalled();
  });

  it("未授权时重新登记并重试一次", async () => {
    mocks.claim
      .mockRejectedValueOnce(new PublicationUnauthorizedError())
      .mockResolvedValueOnce(makeClaim());

    const response = await handlePublicationRequest({
      type: "publication-prepare",
      preferredTaskId: "task",
    });

    expect(response.ok).toBe(true);
    expect(mocks.clearCredential).toHaveBeenCalledOnce();
    expect(mocks.ensureCredential).toHaveBeenCalledWith("http://service", mocks.register);
    expect(mocks.ensureCredential).toHaveBeenCalledTimes(2);
    expect(mocks.claim).toHaveBeenCalledTimes(2);
  });
});
