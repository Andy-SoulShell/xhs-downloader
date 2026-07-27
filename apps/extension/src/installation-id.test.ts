import { describe, expect, it, vi } from "vitest";

import { resolveInstallationId } from "./installation-id";

function makeStorage(initial: Record<string, unknown> = {}) {
  const values = { ...initial };
  return {
    values,
    area: {
      get: vi.fn(async (key: string) => ({ [key]: values[key] })),
      set: vi.fn(async (entries: Record<string, unknown>) => {
        Object.assign(values, entries);
      }),
    } as unknown as chrome.storage.StorageArea,
  };
}

describe("安装实例标识", () => {
  it("首次运行生成并写回", async () => {
    const storage = makeStorage();

    const created = await resolveInstallationId(storage.area);

    expect(created).toMatch(/^[0-9a-f-]{36}$/);
    expect(storage.values.installationId).toBe(created);
  });

  it("已有标识时原样返回且不再写存储", async () => {
    // 每次启动都换标识, 服务端会把同一个浏览器当成源源不断的新实例
    const storage = makeStorage({ installationId: "existing" });

    const resolved = await resolveInstallationId(storage.area);

    expect(resolved).toBe("existing");
    expect(storage.area.set).not.toHaveBeenCalled();
  });

  it("空串视为没有标识", async () => {
    const storage = makeStorage({ installationId: "" });

    const resolved = await resolveInstallationId(storage.area);

    expect(resolved).not.toBe("");
    expect(storage.area.set).toHaveBeenCalledOnce();
  });
});
