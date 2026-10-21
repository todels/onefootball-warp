// Product canvas: draws the warped source into the runtime-owned product
// scene frame. Transparent foreground only — runtime owns the background.

import * as React from "react";

import type { ToolcraftMediaAsset, ToolcraftState } from "@/toolcraft/runtime";
import {
  useToolcraftMediaPresentationUrls,
  useToolcraftPipeline,
  useToolcraftPipelinePass,
  useToolcraftProductSceneFrame,
  useToolcraftSelector,
} from "@/toolcraft/runtime/react";

import { SOURCE_FILE_TARGET } from "./warp-schema-targets";
import { buildWarpParams } from "./warp-params";
import {
  decodeSvgMarkup,
  warpSourceForFrame,
} from "./warp-render";
import {
  decodeWarpSource,
  disposeWarpSource,
  registerWarpSourceDecode,
  unregisterWarpSourceDecode,
  warpSourceKey,
  type WarpSource,
} from "./source-cache";
import { warpRendererPipeline } from "./warp-pipeline";

function selectMediaAssets(state: ToolcraftState): readonly ToolcraftMediaAsset[] {
  return state.mediaAssets;
}

function selectValues(state: ToolcraftState): Readonly<Record<string, unknown>> {
  return state.values;
}

export function findWarpSourceAsset(
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

function readRenderScale(values: Readonly<Record<string, unknown>>): number {
  const value = values["canvas.renderScale"];
  return typeof value === "number" && Number.isFinite(value) && value >= 1
    ? value
    : 2;
}

const decodePass = warpRendererPipeline.getPass("decode-source");

function useDecodedSource(
  asset: ToolcraftMediaAsset | null,
  url: string | undefined,
): WarpSource | null {
  const sourceKey = asset && url ? warpSourceKey(asset.id, url) : null;
  const fileName = asset?.fileName ?? "";
  const mimeType = asset?.mimeType ?? "";
  const assetId = asset?.id ?? "";
  const decodeState = useToolcraftPipelinePass(
    decodePass,
    { sourceKey: sourceKey ?? "none" },
    React.useCallback(
      async (context) => {
        if (!sourceKey || !url) {
          return { fileName: "", kind: "svg", text: "" } as WarpSource;
        }
        return await context.getOrCreateResource(
          [sourceKey],
          () => {
            const promise = decodeWarpSource({ fileName, mimeType }, url);
            registerWarpSourceDecode(assetId, promise);
            promise.catch(() => unregisterWarpSourceDecode(assetId, promise));
            return promise;
          },
          (resource) => {
            disposeWarpSource(resource);
          },
        );
      },
      [assetId, fileName, mimeType, sourceKey, url],
    ),
  );
  if (!sourceKey) return null;
  if (decodeState.status !== "success") return null;
  const decoded = decodeState.result;
  return decoded.kind === "svg" && decoded.text === "" ? null : decoded;
}

export function WarpCanvas(): React.JSX.Element | null {
  const frame = useToolcraftProductSceneFrame();
  const mediaAssets = useToolcraftSelector(selectMediaAssets);
  const values = useToolcraftSelector(selectValues);
  const presentationUrls = useToolcraftMediaPresentationUrls(mediaAssets);

  const sourceAsset = findWarpSourceAsset(mediaAssets);
  const sourceUrl = sourceAsset ? presentationUrls.get(sourceAsset.id) : undefined;
  const source = useDecodedSource(sourceAsset, sourceUrl);

  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const renderScale = readRenderScale(values);
  const params = React.useMemo(() => buildWarpParams(values), [values]);
  const rect = frame.kind === "ready" ? frame.rect : null;

  // One coalesced draw per committed change, routed through the pipeline
  // client so pass execution stays observable. Async SVG decodes are keyed by
  // a generation counter so a stale decode never paints over a newer frame.
  const generationRef = React.useRef(0);
  const pipeline = useToolcraftPipeline();
  const rectWidth = rect?.width ?? 0;
  const rectHeight = rect?.height ?? 0;
  const hasRect = rect !== null;

  React.useEffect(() => {
    if (!hasRect || rectWidth <= 0 || rectHeight <= 0) return;
    const generation = ++generationRef.current;
    let frameHandle: number | null = null;

    const draw = async () => {
      frameHandle = null;
      const canvas = canvasRef.current;
      if (!canvas || generationRef.current !== generation) return;
      const devicePixelRatio = window.devicePixelRatio || 1;
      const pixelScale = devicePixelRatio * renderScale;
      const backingWidth = Math.max(1, Math.round(rectWidth * pixelScale));
      const backingHeight = Math.max(1, Math.round(rectHeight * pixelScale));
      if (canvas.width !== backingWidth) canvas.width = backingWidth;
      if (canvas.height !== backingHeight) canvas.height = backingHeight;
      const context = canvas.getContext("2d");
      if (!context) return;

      const paint = (painter: (ctx: CanvasRenderingContext2D) => void) => {
        if (generationRef.current !== generation) return;
        context.setTransform(pixelScale, 0, 0, pixelScale, 0, 0);
        context.clearRect(0, 0, rectWidth, rectHeight);
        painter(context);
        context.setTransform(1, 0, 0, 1, 0, 0);
      };

      if (!source) {
        paint(() => {});
        return;
      }
      const scene = warpSourceForFrame(
        source,
        params,
        rectWidth,
        rectHeight,
        pixelScale,
      );
      if (!scene) {
        paint(() => {});
        return;
      }
      if (scene.kind === "raster") {
        paint((ctx) => {
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(scene.canvas, scene.x, scene.y, scene.width, scene.height);
        });
        return;
      }
      const image = await decodeSvgMarkup(scene.markup);
      paint((ctx) => {
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(image, scene.x, scene.y, scene.width, scene.height);
      });
    };

    const run = () => {
      if (pipeline) {
        void pipeline
          .runPass(warpRendererPipeline.getPass("warp-rasterize"), undefined, draw)
          .catch(() => {});
      } else {
        void draw().catch(() => {});
      }
    };
    frameHandle = window.requestAnimationFrame(run);
    return () => {
      if (frameHandle !== null) window.cancelAnimationFrame(frameHandle);
    };
  }, [hasRect, params, pipeline, rectHeight, rectWidth, renderScale, source]);

  if (!rect) return null;

  const sourceMegapixels =
    source === null
      ? undefined
      : source.kind === "raster"
        ? ((source.bitmap.width * source.bitmap.height) / 1_000_000).toFixed(3)
        : "vector";

  return (
    <canvas
      data-toolcraft-product-output=""
      data-warp-source-megapixels={sourceMegapixels}
      ref={canvasRef}
      style={{ display: "block", height: "100%", width: "100%" }}
    />
  );
}
