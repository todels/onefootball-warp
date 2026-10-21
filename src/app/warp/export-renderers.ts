// Runtime-owned export entry points. One shared raster frame for image/video
// artifacts and one vector frame for explicit SVG delivery. Runtime owns
// sizing, background, encoding, validation, and download.

import { appendWarpedGroup } from "perspectivo-warp";

import type {
  ToolcraftMediaAsset,
  ToolcraftProductExportRenderer,
  ToolcraftProductSvgExportRenderer,
} from "@/toolcraft/runtime";

import { SOURCE_FILE_TARGET } from "./warp-schema-targets";
import { buildWarpParams } from "./warp-params";
import {
  decodeSvgMarkup,
  svgHasNonVectorContent,
  warpSourceForFrame,
} from "./warp-render";
import { findWarpSourceDecode, type WarpSource } from "./source-cache";

function findSourceAsset(
  assets: readonly ToolcraftMediaAsset[],
): ToolcraftMediaAsset | null {
  for (let index = assets.length - 1; index >= 0; index -= 1) {
    const asset = assets[index];
    if (asset.sourceTarget === SOURCE_FILE_TARGET && asset.assetKind !== "model") {
      return asset;
    }
  }
  return null;
}

async function awaitRetainedSource(
  assetId: string,
  signal: AbortSignal,
): Promise<WarpSource> {
  // The mounted preview owns the decode; wait briefly for a decode that is
  // still in flight instead of failing the export.
  const deadline = Date.now() + 5000;
  for (;;) {
    signal.throwIfAborted();
    const pending = findWarpSourceDecode(assetId);
    if (pending) return await pending;
    if (Date.now() > deadline) {
      throw new Error("The uploaded source is not decoded yet — try again.");
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

export const warpRasterFrameRenderer: ToolcraftProductExportRenderer = {
  baseFileName: "onefootball-warp",
  renderFrame: async ({ context, frame, pixelRatio, signal, state }) => {
    const asset = findSourceAsset(state.mediaAssets);
    if (!asset) return;
    const source = await awaitRetainedSource(asset.id, signal);
    signal.throwIfAborted();
    const scene = warpSourceForFrame(
      source,
      buildWarpParams(state.values),
      frame.width,
      frame.height,
      Math.max(1, pixelRatio),
    );
    if (!scene) return;
    if (scene.kind === "raster") {
      context.imageSmoothingQuality = "high";
      context.drawImage(
        scene.canvas,
        frame.x + scene.x,
        frame.y + scene.y,
        scene.width,
        scene.height,
      );
      return;
    }
    const image = await decodeSvgMarkup(scene.markup, signal);
    signal.throwIfAborted();
    context.imageSmoothingQuality = "high";
    context.drawImage(
      image,
      frame.x + scene.x,
      frame.y + scene.y,
      scene.width,
      scene.height,
    );
  },
};

export const warpVectorFrameRenderer: ToolcraftProductSvgExportRenderer = {
  baseFileName: "onefootball-warp",
  renderFrame: async ({ container, frame, signal, state }) => {
    const asset = findSourceAsset(state.mediaAssets);
    if (!asset) {
      throw new Error("Upload an SVG source before exporting vectors.");
    }
    const source = await awaitRetainedSource(asset.id, signal);
    signal.throwIfAborted();
    if (source.kind !== "svg") {
      throw new Error(
        "A raster source cannot be delivered as editable vectors — export PNG or JPG instead.",
      );
    }
    const scene = warpSourceForFrame(
      source,
      buildWarpParams(state.values),
      frame.width,
      frame.height,
      1,
    );
    if (!scene || scene.kind !== "svg") {
      throw new Error("The source produced no warpable vector geometry.");
    }
    if (svgHasNonVectorContent(scene.root)) {
      throw new Error(
        "This SVG embeds raster or foreign content and cannot ship as a self-contained vector artifact.",
      );
    }
    // Warped geometry is centred on the warp origin; place it in the frame.
    appendWarpedGroup(container, scene.root, {
      scale: scene.layout.scale,
      translateX: frame.x + scene.layout.centerX,
      translateY: frame.y + scene.layout.centerY,
    });
  },
};
