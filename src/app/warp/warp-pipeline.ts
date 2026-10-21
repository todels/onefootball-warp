// Canonical renderer pipeline: one compiled registration shared by runtime
// execution and performance assessment.

import { registerToolcraftRendererPipeline } from "@/toolcraft/runtime";

import { WARP_TARGETS } from "./warp-params";
import { SOURCE_FILE_TARGET } from "./warp-schema-targets";

export const WARP_DIMENSION_SOURCE_MEGAPIXELS = "source-megapixels";
export const WARP_DIMENSION_EXPORT_LONG_EDGE = "export-long-edge";

type WarpPipelineContracts = Readonly<{
  "decode-source": Readonly<{
    resource: import("./source-cache").WarpSource;
    resourceKey: readonly [string];
    result: import("./source-cache").WarpSource;
  }>;
  "warp-rasterize": Readonly<{
    resource: never;
    resourceKey: never;
    result: void;
  }>;
  "warp-export": Readonly<{
    resource: never;
    resourceKey: never;
    result: void;
  }>;
}>;

const continuousWarpTargets = [
  WARP_TARGETS.horizontal,
  WARP_TARGETS.vertical,
  WARP_TARGETS.depth,
  WARP_TARGETS.amount,
  WARP_TARGETS.radius,
  WARP_TARGETS.bend,
  "canvas.renderScale",
] as const;

const discreteWarpTargets = [
  WARP_TARGETS.effect,
  WARP_TARGETS.direction,
  WARP_TARGETS.round,
  WARP_TARGETS.clip,
] as const;

export const warpRendererPipeline =
  registerToolcraftRendererPipeline<WarpPipelineContracts>()({
    interactionInvalidation: [
      {
        interaction: "initial-render",
        invalidates: ["decode-source", "warp-rasterize"],
        targets: [SOURCE_FILE_TARGET],
      },
      {
        interaction: "media-import",
        invalidates: ["decode-source", "warp-rasterize"],
        targets: [SOURCE_FILE_TARGET],
      },
      {
        interaction: "control-drag",
        invalidates: ["warp-rasterize"],
        mustNotInvalidate: ["decode-source"],
        targets: continuousWarpTargets,
      },
      {
        interaction: "control-change",
        invalidates: ["warp-rasterize"],
        mustNotInvalidate: ["decode-source"],
        targets: discreteWarpTargets,
      },
      {
        interaction: "viewport-drag",
        invalidates: [],
        mustNotInvalidate: ["decode-source", "warp-rasterize"],
        targets: ["canvas.offset"],
      },
      {
        interaction: "viewport-zoom",
        invalidates: [],
        mustNotInvalidate: ["decode-source", "warp-rasterize"],
        targets: ["canvas.zoom"],
      },
      {
        interaction: "export",
        invalidates: ["warp-export"],
        mustNotInvalidate: ["decode-source"],
        targets: ["actions.output"],
      },
    ],
    passes: [
      {
        cacheKey: ["sourceKey"],
        cost: {
          dimensions: [WARP_DIMENSION_SOURCE_MEGAPIXELS],
          frequency: "discrete",
          relationship: "linear",
        },
        id: "decode-source",
        inputs: [SOURCE_FILE_TARGET],
        invalidatedBy: [SOURCE_FILE_TARGET],
        kind: "decode",
        lifecycle: { cache: "retained-resource", resourceScope: "source" },
        output: "source",
        quality: "full",
        runsOn: "main",
        sceneBounds: {
          kind: "intrinsic",
          reason:
            "A decoded upload's own pixel or vector extent is the source domain; sampling is capped at the enforced 4096px long edge.",
        },
      },
      {
        cost: {
          dimensions: [WARP_DIMENSION_SOURCE_MEGAPIXELS],
          frequency: "interaction",
          relationship: "linear",
        },
        id: "warp-rasterize",
        inputs: ["decode-source", ...continuousWarpTargets, ...discreteWarpTargets],
        invalidatedBy: [...continuousWarpTargets, ...discreteWarpTargets],
        kind: "rasterize",
        lifecycle: { cache: "none", resourceScope: "call" },
        output: "preview",
        quality: "full",
        runsOn: "main",
        sceneBounds: {
          kind: "intrinsic",
          reason:
            "Warped output is deterministically fitted inside the declared product frame (the plugin's fixed preview window), so the frame is the authored finite output domain.",
        },
      },
      {
        cost: {
          dimensions: [
            WARP_DIMENSION_SOURCE_MEGAPIXELS,
            WARP_DIMENSION_EXPORT_LONG_EDGE,
          ],
          frequency: "batch",
          relationship: "product",
        },
        id: "warp-export",
        inputs: ["decode-source", ...continuousWarpTargets, ...discreteWarpTargets],
        invalidatedBy: ["actions.output"],
        kind: "export",
        lifecycle: { cache: "none", resourceScope: "call" },
        output: "export",
        quality: "export",
        runsOn: "export-only",
      },
    ],
    runtimeId: "onefootball-warp-pipeline",
  });
