import { afterEach, describe, expect, it, vi } from "vitest";

import { installBrowserTaskAutomation, runBrowserTaskPoll } from "./browser-task-runner";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("浏览器任务轮询调度", () => {
  it("保留三十秒 Alarm 兜底且同一长轮询期间不重入", async () => {
    let alarmListener: ((alarm: { name: string }) => void) | undefined;
    const fetchResolvers: Array<(response: Response) => void> = [];
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          fetchResolvers.push(resolve);
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("chrome", {
      runtime: {
        id: "synthetic-extension",
        onInstalled: { addListener: vi.fn() },
        onStartup: { addListener: vi.fn() },
      },
      alarms: {
        create: vi.fn(async () => undefined),
        onAlarm: {
          addListener: vi.fn((listener: (alarm: { name: string }) => void) => {
            alarmListener = listener;
          }),
        },
      },
      storage: {
        local: {
          get: vi.fn(async () => ({
            settings: { serviceUrl: "http://service", mode: "auto" },
          })),
        },
      },
    });

    installBrowserTaskAutomation();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    alarmListener?.({ name: "browser-task-poll" });
    alarmListener?.({ name: "browser-task-poll" });
    await Promise.resolve();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(chrome.alarms.create).toHaveBeenCalledWith("browser-task-poll", {
      delayInMinutes: 0.5,
      periodInMinutes: 0.5,
    });

    fetchResolvers[0](new Response(null, { status: 503 }));
    await runBrowserTaskPoll();
    alarmListener?.({ name: "browser-task-poll" });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    fetchResolvers[1](new Response(null, { status: 503 }));
    await runBrowserTaskPoll();
  });
});
