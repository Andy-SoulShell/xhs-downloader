import { describe, expect, it } from "vitest";

import type { PublicationAsset } from "./publication";
import { IMAGE_LIMIT, planAssetIntake } from "./publication-intake";

function asset(mediaType: string, index = 0): PublicationAsset {
  return {
    asset_id: `synthetic-${mediaType}-${index}`,
    filename: `synthetic-${index}`,
    media_type: mediaType,
    size: 1024,
    sha256: "a".repeat(64),
    position: index,
  };
}

function file(name: string, type: string): File {
  return new File(["synthetic"], name, { type });
}

describe("素材配额预检", () => {
  it("图文超过上限的部分单独挡下，前面的照传", () => {
    const existing = Array.from({ length: IMAGE_LIMIT - 1 }, (_, index) =>
      asset("image/jpeg", index),
    );
    const plan = planAssetIntake(existing, [
      file("第十八张.jpg", "image/jpeg"),
      file("第十九张.jpg", "image/jpeg"),
    ]);

    expect(plan.accepted.map((item) => item.name)).toEqual(["第十八张.jpg"]);
    expect(plan.rejected).toEqual([
      { filename: "第十九张.jpg", reason: `图文笔记最多 ${IMAGE_LIMIT} 张图片` },
    ]);
  });

  it("同一批里的第二个视频也算数", () => {
    const plan = planAssetIntake(
      [],
      [file("第一个.mp4", "video/mp4"), file("第二个.mp4", "video/mp4")],
    );

    expect(plan.accepted.map((item) => item.name)).toEqual(["第一个.mp4"]);
    expect(plan.rejected[0].reason).toBe("视频笔记只能有一个视频");
  });

  it("图片和视频不混发，两个方向都挡", () => {
    expect(
      planAssetIntake([asset("image/jpeg")], [file("片子.mp4", "video/mp4")]).rejected[0],
    ).toEqual({ filename: "片子.mp4", reason: "视频不能和图片一起发" });
    expect(
      planAssetIntake([asset("video/mp4")], [file("图.jpg", "image/jpeg")]).rejected[0],
    ).toEqual({ filename: "图.jpg", reason: "图片不能和视频一起发" });
  });

  it("既不是图片也不是视频的直接说清楚", () => {
    const plan = planAssetIntake([], [file("说明.pdf", "application/pdf")]);

    expect(plan.accepted).toEqual([]);
    expect(plan.rejected[0].reason).toBe("只能添加图片或视频");
  });

  it("没超限时原样放行", () => {
    const plan = planAssetIntake([], [file("一.jpg", "image/jpeg"), file("二.png", "image/png")]);

    expect(plan.accepted).toHaveLength(2);
    expect(plan.rejected).toEqual([]);
  });
});
