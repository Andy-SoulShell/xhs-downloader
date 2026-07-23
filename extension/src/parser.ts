import type {
  ExtensionMedia,
  ExtensionWork,
} from "./types";

const INITIAL_STATE_PREFIX = "window.__INITIAL_STATE__";
const EPHEMERAL_IMAGE_ROUTE = /^\d{12}\/[0-9a-f]{32}\//i;

type DataMap = Record<string, unknown>;

export function parseCurrentDocument(
  page: Document,
  sourceUrl: string,
): ExtensionWork {
  const scripts = [...page.scripts]
    .map((script) => script.textContent?.trim() ?? "")
    .reverse();
  const script = scripts.find((text) => text.startsWith(INITIAL_STATE_PREFIX));
  if (!script) throw new Error("当前页面没有可解析的帖子数据");
  return parseInitialStateScript(script, sourceUrl);
}

export function parseInitialStateScript(
  script: string,
  sourceUrl: string,
): ExtensionWork {
  const separator = script.indexOf("=");
  if (separator < 0) throw new Error("帖子初始状态格式无效");
  const raw = script
    .slice(separator + 1)
    .trim()
    .replace(/;$/, "");
  let state: DataMap;
  try {
    state = JSON.parse(normalizeJavaScriptValue(raw)) as DataMap;
  } catch {
    throw new Error("帖子初始状态无法解析");
  }
  const workId = workIdFromUrl(sourceUrl);
  const note = selectNote(state, workId);
  const resolvedWorkId = text(note.noteId) || workId;
  const user = object(note.user);
  const authorId = text(user.userId);
  const images = list(note.imageList);
  const video = object(note.video);
  const kind = text(note.type);
  const media =
    kind === "video" && images.length <= 1
      ? parseVideo(video, images)
      : parseImages(images);
  return {
    workId: resolvedWorkId,
    sourceUrl,
    title: text(note.title),
    description: text(note.desc),
    authorName: text(user.nickname) || text(user.nickName) || authorId,
    authorAvatar: text(user.avatar) || text(user.image) || undefined,
    media,
  };
}

function selectNote(state: DataMap, workId: string): DataMap {
  const noteMap = object(deepGet(state, "note.noteDetailMap"));
  const direct = object(noteMap[workId]);
  const wrapper = hasKeys(direct)
    ? direct
    : object(Object.values(noteMap).at(-1));
  const note = object(wrapper.note);
  if (Object.keys(note).length) return note;
  const phoneNote = object(deepGet(state, "noteData.data.noteData"));
  if (Object.keys(phoneNote).length) return phoneNote;
  throw new Error("当前页面没有可解析的帖子数据");
}

function parseVideo(video: DataMap, images: DataMap[]): ExtensionMedia[] {
  const originKey = text(deepGet(video, "consumer.originVideoKey"));
  const url = originKey
    ? `https://sns-video-bd.xhscdn.com/${originKey}`
    : selectVideoStream(video);
  if (!url) return [];
  const preview = text(images[0]?.urlDefault) || text(images[0]?.url);
  return [
    {
      index: 1,
      kind: "video",
      url: decodeUrl(url),
      suffix: "mp4",
      previewUrl: preview ? stableImageUrl(preview) : undefined,
    },
  ];
}

function selectVideoStream(video: DataMap): string {
  const streams = [
    ...list(deepGet(video, "media.stream.h264")),
    ...list(deepGet(video, "media.stream.h265")),
  ];
  const selected = streams.sort(
    (left, right) => number(right.height) - number(left.height),
  )[0];
  const backups = Array.isArray(selected?.backupUrls)
    ? selected.backupUrls
    : [];
  return (
    backups.find((item): item is string => typeof item === "string" && !!item) ??
    text(selected?.masterUrl)
  );
}

function parseImages(images: DataMap[]): ExtensionMedia[] {
  return images.flatMap((image, position) => {
    const index = position + 1;
    const result: ExtensionMedia[] = [];
    const imageUrl = text(image.urlDefault) || text(image.url);
    if (imageUrl) {
      result.push({
        index,
        kind: "image",
        url: stableImageUrl(imageUrl),
        suffix: imageSuffix(imageUrl),
      });
    }
    const liveUrl = text(deepGet(image, "stream.h264.0.masterUrl"));
    if (liveUrl) {
      result.push({
        index,
        kind: "live",
        url: decodeUrl(liveUrl),
        suffix: "mp4",
        previewUrl: imageUrl ? stableImageUrl(imageUrl) : undefined,
      });
    }
    return result;
  });
}

function stableImageUrl(value: string): string {
  const parsed = new URL(decodeUrl(value));
  const path = parsed.pathname
    .replace(/^\//, "")
    .replace(EPHEMERAL_IMAGE_ROUTE, "")
    .split("!", 1)[0];
  return `https://sns-img-bd.xhscdn.com/${path}`;
}

function imageSuffix(value: string): string {
  const match = decodeUrl(value).match(/_(avif|heic|jpeg|jpg|png|webp)(?:_|$)/i);
  const suffix = match?.[1]?.toLowerCase();
  return suffix === "jpg" ? "jpeg" : suffix || "jpeg";
}

function normalizeJavaScriptValue(value: string): string {
  let result = "";
  let quote = "";
  let escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (quote) {
      result += character;
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = "";
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      result += character;
      continue;
    }
    const token = value.slice(index, index + 9);
    if (
      token === "undefined" &&
      isBoundary(value[index - 1]) &&
      isBoundary(value[index + 9])
    ) {
      result += "null";
      index += 8;
      continue;
    }
    result += character;
  }
  return result;
}

function isBoundary(value: string | undefined): boolean {
  return !value || !/[A-Za-z0-9_$]/.test(value);
}

function workIdFromUrl(value: string): string {
  const parts = new URL(value).pathname.split("/").filter(Boolean);
  return parts.at(-1) ?? "";
}

function deepGet(value: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, segment) => {
    if (Array.isArray(current)) return current[Number(segment)];
    return object(current)[segment];
  }, value);
}

function object(value: unknown): DataMap {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as DataMap)
    : {};
}

function list(value: unknown): DataMap[] {
  return Array.isArray(value) ? value.map(object).filter(hasKeys) : [];
}

function hasKeys(value: DataMap): boolean {
  return Object.keys(value).length > 0;
}

function text(value: unknown): string {
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : "";
}

function number(value: unknown): number {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
}

function decodeUrl(value: string): string {
  return value
    .replaceAll("\\u002F", "/")
    .replaceAll("\\/", "/")
    .replaceAll("\\u0026", "&");
}
