import type {
  DownloadPreference,
  ExtensionResponse,
  ExtensionState,
  ExtensionWork,
} from "./types";

interface PanelActions {
  close: () => void;
  download: (indexes: number[]) => Promise<ExtensionResponse>;
  setMode: (mode: DownloadPreference) => Promise<ExtensionResponse>;
  sync: () => Promise<ExtensionResponse>;
}

export function renderPanel(
  root: ShadowRoot,
  work: ExtensionWork,
  state: ExtensionState,
  actions: PanelActions,
): void {
  root.querySelector(".xhd-panel")?.remove();
  const panel = document.createElement("aside");
  panel.className = "xhd-panel";
  panel.setAttribute("aria-label", "xhs-downloader 下载面板");
  panel.append(
    renderHeader(actions.close),
    renderConnection(state),
    renderWork(work),
  );

  const selected = new Set(uniqueIndexes(work));
  const mediaSection = renderMedia(work, selected);
  const status = document.createElement("p");
  status.className = "xhd-status";
  status.setAttribute("role", "status");

  const controls = renderControls(state, {
    onDownload: async () => {
      setBusy(controls.download, true, "正在下载…");
      const response = await actions.download([...selected].sort((a, b) => a - b));
      status.textContent = response.message;
      status.dataset.tone = response.ok ? "success" : "error";
      setBusy(controls.download, false, `下载已选 ${selected.size} 项`);
    },
    onModeChange: async (mode) => {
      const response = await actions.setMode(mode);
      status.textContent = response.message;
    },
    onSync: async () => {
      setBusy(controls.sync, true, "正在同步…");
      const response = await actions.sync();
      status.textContent = response.message;
      status.dataset.tone = response.ok ? "success" : "error";
      setBusy(controls.sync, false, "同步独立记录");
      if (response.ok) controls.sync.hidden = true;
    },
  });

  panel.append(mediaSection, status, controls.element);
  root.append(panel);
}

function renderHeader(onClose: () => void): HTMLElement {
  const header = document.createElement("header");
  header.className = "xhd-header";
  const brand = document.createElement("div");
  const eyebrow = document.createElement("span");
  eyebrow.textContent = "XHS-DOWNLOADER";
  const title = document.createElement("strong");
  title.textContent = "下载当前帖子";
  brand.append(eyebrow, title);
  const close = document.createElement("button");
  close.className = "xhd-icon-button";
  close.type = "button";
  close.ariaLabel = "关闭下载面板";
  close.textContent = "×";
  close.addEventListener("click", onClose);
  header.append(brand, close);
  return header;
}

function renderConnection(state: ExtensionState): HTMLElement {
  const row = document.createElement("div");
  row.className = "xhd-connection";
  const badge = document.createElement("span");
  badge.dataset.online = String(state.online);
  badge.textContent = state.online ? "本地服务在线" : "独立模式";
  const explanation = document.createElement("span");
  explanation.textContent = state.online
    ? "自动模式将使用后台能力"
    : "由浏览器直接完成下载";
  row.append(badge, explanation);
  return row;
}

function renderWork(work: ExtensionWork): HTMLElement {
  const section = document.createElement("section");
  section.className = "xhd-work";
  const author = document.createElement("div");
  author.className = "xhd-author";
  if (work.authorAvatar) {
    const avatar = document.createElement("img");
    avatar.alt = "";
    avatar.referrerPolicy = "no-referrer";
    avatar.src = work.authorAvatar;
    author.append(avatar);
  }
  const name = document.createElement("span");
  name.textContent = work.authorName || "作者未知";
  author.append(name);
  const title = document.createElement("h2");
  title.textContent = work.title || "未命名帖子";
  section.append(author, title);
  if (work.description) {
    const description = document.createElement("p");
    description.textContent = work.description;
    section.append(description);
  }
  return section;
}

function renderMedia(
  work: ExtensionWork,
  selected: Set<number>,
): HTMLElement {
  const section = document.createElement("section");
  const heading = document.createElement("h3");
  heading.textContent = `选择媒体 · ${selected.size} 项`;
  const grid = document.createElement("div");
  grid.className = "xhd-media-grid";
  for (const index of uniqueIndexes(work)) {
    const resources = work.media.filter((item) => item.index === index);
    const preview =
      resources.find((item) => item.kind === "image")?.url ??
      resources.find((item) => item.previewUrl)?.previewUrl;
    const label = document.createElement("label");
    label.className = "xhd-media";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = true;
    input.addEventListener("change", () => {
      if (input.checked) selected.add(index);
      else selected.delete(index);
      label.dataset.selected = String(input.checked);
      heading.textContent = `选择媒体 · ${selected.size} 项`;
    });
    label.dataset.selected = "true";
    if (preview) {
      const image = document.createElement("img");
      image.alt = `第 ${index} 项预览`;
      image.referrerPolicy = "no-referrer";
      image.src = preview;
      label.append(image);
    } else {
      const empty = document.createElement("span");
      empty.className = "xhd-media-empty";
      empty.textContent = "无封面";
      label.append(empty);
    }
    const meta = document.createElement("span");
    meta.textContent = `${String(index).padStart(2, "0")} · ${mediaLabel(resources)}`;
    label.append(input, meta);
    grid.append(label);
  }
  section.append(heading, grid);
  return section;
}

function renderControls(
  state: ExtensionState,
  handlers: {
    onDownload: () => Promise<void>;
    onModeChange: (mode: DownloadPreference) => Promise<void>;
    onSync: () => Promise<void>;
  },
): { element: HTMLElement; download: HTMLButtonElement; sync: HTMLButtonElement } {
  const footer = document.createElement("footer");
  footer.className = "xhd-controls";
  const select = document.createElement("select");
  select.ariaLabel = "下载模式";
  for (const [value, label] of [
    ["auto", "自动选择"],
    ["browser", "浏览器下载"],
    ["background", "后台下载"],
  ] as const) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    option.selected = state.mode === value;
    select.append(option);
  }
  select.addEventListener("change", () => {
    void handlers.onModeChange(select.value as DownloadPreference);
  });
  const sync = document.createElement("button");
  sync.className = "xhd-secondary";
  sync.type = "button";
  sync.hidden = !state.online || state.pendingRecords === 0;
  sync.textContent = `同步独立记录${state.pendingRecords ? `（${state.pendingRecords}）` : ""}`;
  sync.addEventListener("click", () => void handlers.onSync());
  const download = document.createElement("button");
  download.className = "xhd-primary";
  download.type = "button";
  download.textContent = "下载已选项目";
  download.addEventListener("click", () => void handlers.onDownload());
  footer.append(select, sync, download);
  return { element: footer, download, sync };
}

function uniqueIndexes(work: ExtensionWork): number[] {
  return [...new Set(work.media.map((item) => item.index))];
}

function mediaLabel(resources: ExtensionWork["media"]): string {
  if (resources.some((item) => item.kind === "live")) return "动态图片";
  if (resources.some((item) => item.kind === "video")) return "视频";
  return "图片";
}

function setBusy(
  button: HTMLButtonElement,
  busy: boolean,
  label: string,
): void {
  button.disabled = busy;
  button.textContent = label;
}
