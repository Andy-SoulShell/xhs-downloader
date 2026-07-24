import type { MediaResource } from "./types";

export interface MediaGroup {
  index: number;
  resources: MediaResource[];
  preview: MediaResource;
}

export function groupMedia(resources: MediaResource[]): MediaGroup[] {
  return [...new Set(resources.map((item) => item.序号))].map((index) => {
    const group = resources.filter((item) => item.序号 === index);
    const preview =
      group.find((item) => item.类型 === "图片") ??
      group.find((item) => item.类型 === "视频") ??
      group[0];
    return { index, resources: group, preview };
  });
}

export function mediaLabel(group: MediaGroup): string {
  if (group.resources.some((item) => item.类型 === "动态图片")) {
    return "动态图片";
  }
  if (group.resources.some((item) => item.类型 === "视频")) return "视频";
  return "图片";
}

export function mediaCover(group: MediaGroup): string | undefined {
  const image = group.resources.find((item) => item.类型 === "图片");
  const video = group.resources.find((item) => item.类型 === "视频");
  return image?.地址 ?? video?.预览地址 ?? undefined;
}
