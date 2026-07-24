import type {
  PublicationAsset,
  PublicationAssetChunk,
} from "./publication-types";

export type AssetChunkLoader = (
  assetId: string,
  offset: number,
) => Promise<PublicationAssetChunk>;

export async function assemblePublicationFile(
  asset: PublicationAsset,
  loadChunk: AssetChunkLoader,
): Promise<File> {
  const chunks: ArrayBuffer[] = [];
  let offset = 0;
  while (offset < asset.size) {
    const chunk = await loadChunk(asset.asset_id, offset);
    if (
      chunk.offset !== offset ||
      chunk.nextOffset <= offset ||
      chunk.total !== asset.size
    ) {
      throw new Error(`素材 ${asset.filename} 的分段顺序无效`);
    }
    chunks.push(Uint8Array.from(base64ToBytes(chunk.base64)).buffer);
    offset = chunk.nextOffset;
    if (chunk.done && offset !== asset.size) {
      throw new Error(`素材 ${asset.filename} 提前结束`);
    }
  }
  const blob = new Blob(chunks, { type: asset.media_type });
  if (blob.size !== asset.size) {
    throw new Error(`素材 ${asset.filename} 大小校验失败`);
  }
  const digest = await sha256Hex(await blob.arrayBuffer());
  if (digest !== asset.sha256) {
    throw new Error(`素材 ${asset.filename} 完整性校验失败`);
  }
  return new File([blob], asset.filename, {
    type: asset.media_type,
    lastModified: Date.now(),
  });
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function sha256Hex(value: ArrayBuffer): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", value));
  return [...digest]
    .map((item) => item.toString(16).padStart(2, "0"))
    .join("");
}
