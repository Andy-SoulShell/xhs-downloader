import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearExtensionCredential,
  ensureExtensionCredential,
  loadExtensionCredential,
  saveExtensionCredential,
} from "./extension-credential";

let values: Record<string, unknown>;

beforeEach(() => {
  values = {};
  vi.stubGlobal("chrome", {
    runtime: { id: "extension" },
    storage: {
      local: {
        get: vi.fn(async (keys: string | string[]) =>
          Object.fromEntries(
            (Array.isArray(keys) ? keys : [keys]).map((key) => [key, values[key]]),
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

describe("共享扩展能力令牌", () => {
  it("保存、读取和清除令牌", async () => {
    const credential = { extensionId: "extension", token: "token" };
    await saveExtensionCredential(credential);
    await expect(loadExtensionCredential()).resolves.toEqual(credential);
    await clearExtensionCredential();
    await expect(loadExtensionCredential()).resolves.toBeUndefined();
  });

  it("兼容旧发布令牌并忽略损坏内容", async () => {
    values.publicationCredential = {
      extensionId: "legacy-extension",
      token: "legacy-token",
    };
    await expect(loadExtensionCredential()).resolves.toEqual({
      extensionId: "legacy-extension",
      token: "legacy-token",
    });
    values.publicationCredential = { extensionId: 1, token: null };
    await expect(loadExtensionCredential()).resolves.toBeUndefined();
  });

  it("并发登记只签发并保存一份令牌", async () => {
    const issuer = vi.fn(async () => ({
      extensionId: "extension",
      token: "issued-token",
    }));
    const [first, second] = await Promise.all([
      ensureExtensionCredential("http://service", issuer),
      ensureExtensionCredential("http://service", issuer),
    ]);

    expect(first).toEqual(second);
    expect(issuer).toHaveBeenCalledTimes(1);
    expect(values.extensionCredential).toEqual(first);
  });
});
