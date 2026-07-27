import type { PublicationAsset } from "./publication";

/**
 * 添加素材前的本地配额预检。
 *
 * 规则与服务端 `_validate_new_asset` 一致。放在这里再算一遍不是重复：
 * 一次选 30 张图直接开传，第 19 张起每一个请求都注定失败，用户看到的是
 * 一串报错而不是一句"最多 18 张"。
 */

/** 图文笔记允许的图片数上限。 */
export const IMAGE_LIMIT = 18;

export interface RejectedFile {
  filename: string;
  /** 面向用户的原因，直接显示。 */
  reason: string;
}

export interface AssetIntakePlan {
  accepted: File[];
  rejected: RejectedFile[];
}

/**
 * 按已有素材裁剪这次选中的文件。
 *
 * 逐个判断而不是整批拒绝：选了 20 张图时前 18 张仍然该传上去，剩下两张
 * 说清楚为什么没传。
 *
 * @param existing 草稿现有素材。
 * @param files 本次选中的文件，按用户选择顺序。
 * @returns 可以上传的文件与被挡下的文件及原因。
 */
export function planAssetIntake(existing: PublicationAsset[], files: File[]): AssetIntakePlan {
  const accepted: File[] = [];
  const rejected: RejectedFile[] = [];
  let images = existing.filter((asset) => !isVideoType(asset.media_type)).length;
  let videos = existing.filter((asset) => isVideoType(asset.media_type)).length;

  for (const file of files) {
    const reason = rejectionReason(file, images, videos);
    if (reason) {
      rejected.push({ filename: file.name, reason });
      continue;
    }
    accepted.push(file);
    if (isVideoType(file.type)) videos += 1;
    else images += 1;
  }
  return { accepted, rejected };
}

function rejectionReason(file: File, images: number, videos: number): string {
  if (!/^(image|video)\//.test(file.type)) return "只能添加图片或视频";
  if (isVideoType(file.type)) {
    if (videos) return "视频笔记只能有一个视频";
    if (images) return "视频不能和图片一起发";
    return "";
  }
  if (videos) return "图片不能和视频一起发";
  if (images >= IMAGE_LIMIT) return `图文笔记最多 ${IMAGE_LIMIT} 张图片`;
  return "";
}

function isVideoType(mediaType: string): boolean {
  return mediaType.startsWith("video/");
}
