import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PublicationClaim } from "./publication-types";
import {
  clearActivePublicationClaim,
  clearPublicationCredential,
  loadActivePublicationClaim,
  loadActivePublicationOwner,
  loadPublicationCredential,
  saveActivePublicationClaim,
  saveActivePublicationOwner,
  savePublicationCredential,
} from "./publication-storage";

let values: Record<string, unknown>;

beforeEach(() => {
  values = {};
  vi.stubGlobal("chrome", {
    storage: {
      local: {
        get: vi.fn(async (keys: string | string[]) =>
          Object.fromEntries(
            (Array.isArray(keys) ? keys : [keys]).map((key) => [
              key,
              values[key],
            ]),
          ),
        ),
        set: vi.fn(async (next: Record<string, unknown>) => {
          Object.assign(values, next);
        }),
        remove: vi.fn(async (keys: string | string[]) => {
          for (const key of Array.isArray(keys) ? keys : [keys]) {
            delete values[key];
          }
        }),
      },
    },
  });
});

afterEach(() => vi.unstubAllGlobals());

describe("扩展发布状态存储", () => {
  it("保存、读取和清除能力令牌", async () => {
    const credential = { extensionId: "extension", token: "token" };
    await savePublicationCredential(credential);
    await expect(loadPublicationCredential()).resolves.toEqual(credential);
    await clearPublicationCredential();
    await expect(loadPublicationCredential()).resolves.toBeUndefined();
  });

  it("忽略损坏凭据并持久化活动租约", async () => {
    values.publicationCredential = { extensionId: 1, token: null };
    await expect(loadPublicationCredential()).resolves.toBeUndefined();
    const claim = {
      task: {
        task_id: "task",
        lease_expires_at: "2026-01-01T00:05:00.000Z",
      },
      lease_token: "lease",
    };
    await saveActivePublicationClaim(claim as PublicationClaim);
    await saveActivePublicationOwner(42);
    await expect(loadActivePublicationClaim()).resolves.toEqual(claim);
    await expect(loadActivePublicationOwner()).resolves.toBe(42);
    await clearActivePublicationClaim();
    await expect(loadActivePublicationClaim()).resolves.toBeUndefined();
    await expect(loadActivePublicationOwner()).resolves.toBeUndefined();
  });

  it("忽略缺少任务或租约的活动记录", async () => {
    values.activePublicationClaim = {
      task: {},
      lease_token: 1,
    };
    await expect(loadActivePublicationClaim()).resolves.toBeUndefined();
    values.activePublicationOwner = -1;
    await expect(loadActivePublicationOwner()).resolves.toBeUndefined();
  });
});
