// Shared deterministic warp layout used by the live preview and the runtime
// export renderers, so artifacts always match the canvas. All DOM-side work
// (SVG parsing, serialization, decoding) lives in the vendored engine package.

import {
  serializeWarpedSvg,
  warpRaster,
  warpSvgDoc,
  type WarpParams,
  type WarpSource,
} from "perspectivo-warp";

export { decodeSvgMarkup, svgHasNonVectorContent } from "perspectivo-warp";

export type SceneLayout = Readonly<{
  /** Frame-local coordinates of the warp origin (artwork centre). */
  centerX: number;
  centerY: number;
  /** Scene units per warped-geometry unit. */
  scale: number;
}>;

/**
 * The plugin's fixed preview window: framed off the unwarped artwork so the
 * artwork visibly recedes while dragging, grown only when a warp would
 * otherwise clip. Output always stays inside the frame — the product frame is
 * the authored output domain.
 */
export function computeSceneLayout(
  sourceWidth: number,
  sourceHeight: number,
  bounds: Readonly<{ minX: number; minY: number; maxX: number; maxY: number }>,
  frameWidth: number,
  frameHeight: number,
): SceneLayout {
  const halfW =
    Math.max(sourceWidth * 0.62, Math.abs(bounds.minX), Math.abs(bounds.maxX)) *
    1.04;
  const halfH =
    Math.max(sourceHeight * 0.62, Math.abs(bounds.minY), Math.abs(bounds.maxY)) *
    1.04;
  const scale = Math.min(
    frameWidth / Math.max(1, halfW * 2),
    frameHeight / Math.max(1, halfH * 2),
  );
  return { centerX: frameWidth / 2, centerY: frameHeight / 2, scale };
}

export type WarpedScene =
  | Readonly<{
      kind: "raster";
      canvas: HTMLCanvasElement;
      /** Frame-local placement in scene units. */
      x: number;
      y: number;
      width: number;
      height: number;
      layout: SceneLayout;
    }>
  | Readonly<{
      kind: "svg";
      markup: string;
      x: number;
      y: number;
      width: number;
      height: number;
      layout: SceneLayout;
      /** The mutated warped document, for the vector export path. */
      root: SVGSVGElement;
      bounds: Readonly<{ minX: number; minY: number; maxX: number; maxY: number }>;
    }>;

/**
 * Warp a source for a frame of the given scene size. `pixelScale` is backing
 * pixels per scene unit and controls raster resolution only, never layout.
 */
export function warpSourceForFrame(
  source: WarpSource,
  params: WarpParams,
  frameWidth: number,
  frameHeight: number,
  pixelScale: number,
): WarpedScene | null {
  if (source.kind === "raster") {
    const sourceWidth = source.bitmap.width;
    const sourceHeight = source.bitmap.height;
    const preliminaryLayout = computeSceneLayout(
      sourceWidth,
      sourceHeight,
      {
        maxX: sourceWidth / 2,
        maxY: sourceHeight / 2,
        minX: -sourceWidth / 2,
        minY: -sourceHeight / 2,
      },
      frameWidth,
      frameHeight,
    );
    const rasterScale = Math.max(
      0.05,
      Math.min(4, preliminaryLayout.scale * pixelScale),
    );
    const clip = params.mode === "bulge" && params.clip === true;
    const warped = warpRaster(source.bitmap, params, {
      clip,
      scale: rasterScale,
    });
    if (!warped) return null;
    const layout = computeSceneLayout(
      sourceWidth,
      sourceHeight,
      {
        maxX: warped.minX + warped.width,
        maxY: warped.minY + warped.height,
        minX: warped.minX,
        minY: warped.minY,
      },
      frameWidth,
      frameHeight,
    );
    return {
      canvas: warped.canvas,
      height: warped.height * layout.scale,
      kind: "raster",
      layout,
      width: warped.width * layout.scale,
      x: layout.centerX + warped.minX * layout.scale,
      y: layout.centerY + warped.minY * layout.scale,
    };
  }

  const result = warpSvgDoc(source.text, params, 1);
  const bounds = {
    maxX: result.maxX,
    maxY: result.maxY,
    minX: result.minX,
    minY: result.minY,
  };
  const layout = computeSceneLayout(
    result.srcW,
    result.srcH,
    bounds,
    frameWidth,
    frameHeight,
  );
  const width = Math.max(1, bounds.maxX - bounds.minX);
  const height = Math.max(1, bounds.maxY - bounds.minY);
  const markup = serializeWarpedSvg(
    result.svg,
    bounds.minX,
    bounds.minY,
    width,
    height,
  );
  return {
    bounds,
    height: height * layout.scale,
    kind: "svg",
    layout,
    markup,
    root: result.svg,
    width: width * layout.scale,
    x: layout.centerX + bounds.minX * layout.scale,
    y: layout.centerY + bounds.minY * layout.scale,
  };
}
