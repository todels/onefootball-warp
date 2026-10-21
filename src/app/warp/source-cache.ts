// Decoded-source registry. The decode pass retains the decoded source through
// the renderer pipeline's generation-bound resource context (renderer
// lifecycle contract); this module only mirrors in-flight and settled decodes
// so the export renderers can read the same source without owning it.

import {
  decodeWarpSource as vendorDecodeWarpSource,
  disposeWarpSource,
  type WarpSource,
} from "perspectivo-warp";

export type { WarpSource } from "perspectivo-warp";
export { disposeWarpSource } from "perspectivo-warp";

/** Enforced sampling boundary: sources above this long edge are downscaled, so
 * the warp's per-source workload has a hard ceiling (see app-performance). */
export const MAX_SOURCE_EDGE_PX = 4096;

export function isSvgMimeType(mimeType: string, fileName = ""): boolean {
  return mimeType === "image/svg+xml" || /\.svg$/iu.test(fileName);
}

export function warpSourceKey(assetId: string, url: string): string {
  return `${assetId}:${url}`;
}

export function decodeWarpSource(
  asset: Readonly<{ fileName: string; mimeType: string }>,
  url: string,
): Promise<WarpSource> {
  return vendorDecodeWarpSource(asset, url, MAX_SOURCE_EDGE_PX);
}

const decodesByAssetId = new Map<string, Promise<WarpSource>>();

export function registerWarpSourceDecode(
  assetId: string,
  promise: Promise<WarpSource>,
): void {
  decodesByAssetId.set(assetId, promise);
}

export function unregisterWarpSourceDecode(
  assetId: string,
  promise: Promise<WarpSource>,
): void {
  if (decodesByAssetId.get(assetId) === promise) {
    decodesByAssetId.delete(assetId);
  }
}

/** Export-side lookup: the mounted preview owns the decode; export reads it. */
export function findWarpSourceDecode(
  assetId: string,
): Promise<WarpSource> | null {
  return decodesByAssetId.get(assetId) ?? null;
}

export { disposeWarpSourceSafely };

function disposeWarpSourceSafely(source: WarpSource): void {
  try {
    disposeWarpSource(source);
  } catch {
    // Releasing an already-closed bitmap is harmless.
  }
}
