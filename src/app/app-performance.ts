import {
  defineToolcraftPerformance,
  type ToolcraftEnvelopePerformanceConfig,
} from "@/toolcraft/runtime";

import {
  WARP_DIMENSION_EXPORT_LONG_EDGE,
  WARP_DIMENSION_SOURCE_MEGAPIXELS,
  warpRendererPipeline,
} from "./warp/warp-pipeline";

/** Canonical path ids from `deriveToolcraftPerformancePaths(appSchema, appPerformance)`. */
export const WARP_PERFORMANCE_PATH_IDS = {
  controlChange:
    "performance-path:%5B%22interactive-discrete%22%2C%22control-change%22%2C%5B%22warp-rasterize%22%5D%2C%5B%5D%2C%5B%5D%2C%5B%22main%22%5D%2C%5B%22source-megapixels%22%5D%5D",
  controlDrag:
    "performance-path:%5B%22interactive-continuous%22%2C%22control-drag%22%2C%5B%22warp-rasterize%22%5D%2C%5B%5D%2C%5B%5D%2C%5B%22main%22%5D%2C%5B%22source-megapixels%22%5D%5D",
  export:
    "performance-path:%5B%22batch-responsive%22%2C%22export%22%2C%5B%22warp-export%22%5D%2C%5B%5D%2C%5B%5D%2C%5B%22export-only%22%5D%2C%5B%22export-long-edge%22%2C%22source-megapixels%22%5D%5D",
  initialRender:
    "performance-path:%5B%22initial-render%22%2C%22initial-render%22%2C%5B%22decode-source%22%2C%22warp-rasterize%22%5D%2C%5B%5D%2C%5B%5D%2C%5B%22main%22%5D%2C%5B%22source-megapixels%22%5D%5D",
  mediaImport:
    "performance-path:%5B%22batch-responsive%22%2C%22media-import%22%2C%5B%22decode-source%22%2C%22warp-rasterize%22%5D%2C%5B%5D%2C%5B%5D%2C%5B%22main%22%5D%2C%5B%22source-megapixels%22%5D%5D",
  viewportDrag:
    "performance-path:%5B%22interactive-continuous%22%2C%22viewport-drag%22%2C%5B%5D%2C%5B%5D%2C%5B%5D%2C%5B%5D%2C%5B%5D%5D",
  viewportZoom:
    "performance-path:%5B%22interactive-continuous%22%2C%22viewport-zoom%22%2C%5B%5D%2C%5B%5D%2C%5B%5D%2C%5B%5D%2C%5B%5D%5D",
} as const;

const browserPathTestName = (pathId: string): string =>
  `browser perf: toolcraft path ${pathId}`;

export const appPerformance: ToolcraftEnvelopePerformanceConfig =
  defineToolcraftPerformance({
    fixtureAdapters: {
      dimensions: {
        [WARP_DIMENSION_SOURCE_MEGAPIXELS]: {
          apply: (value: number) => value,
          dimensionId: WARP_DIMENSION_SOURCE_MEGAPIXELS,
          observe: (value) => value as number,
        },
        [WARP_DIMENSION_EXPORT_LONG_EDGE]: {
          apply: (value: number) =>
            value >= 8192 ? "8k" : value >= 4096 ? "4k" : "2k",
          dimensionId: WARP_DIMENSION_EXPORT_LONG_EDGE,
          domain: {
            kind: "schema-options",
            optionValues: ["2k", "4k", "8k"],
            target: "export.image.resolution",
          },
          entries: [
            { appliedValue: "2k", value: 2048 },
            { appliedValue: "4k", value: 4096 },
            { appliedValue: "8k", value: 8192 },
          ],
          kind: "exhaustive-discrete",
          observe: (value) =>
            value === "8k" ? 8192 : value === "4k" ? 4096 : 2048,
        },
      },
    },
    rendererPipeline: warpRendererPipeline,
    rendererStrategy: "canvas-2d",
    rendererTechnique: {
      exportRenderer: "canvas-2d",
      fidelityRisks: [
        "SVG sources are rasterized in the live preview and PNG/JPG artifacts; the explicit SVG artifact preserves editable vectors.",
        "Raster sources above the enforced 4096px long edge are downsampled before warping.",
      ],
      intentionalRasterizationReason:
        "The warp preview composites both raster and vector sources through one Canvas 2D surface so every effect shares one deterministic pipeline; vector fidelity is preserved by the separate SVG artifact path.",
      layers: [
        {
          content: ["bitmap-media", "geometry"],
          exportMode: "composited",
          id: "warp-preview-layer",
          intentionalRasterizationReason:
            "Vector sources rasterize into the shared preview surface; the SVG artifact keeps editable vectors.",
          kind: "product-foreground",
          primitiveCount: "low",
          renderer: "canvas-2d",
          uiSelector: "canvas[data-toolcraft-product-output]",
        },
      ],
      performanceRisks: [
        "Per-pixel inverse sampling cost grows linearly with sampled source pixels; sampling is capped at a 4096px long edge.",
        "8K export warps at the full output resolution as one batch pass.",
      ],
      previewRenderer: "canvas-2d",
      productRepresentation: "mixed",
      rendererStrategy: "canvas-2d",
      sourceRepresentation: "mixed",
      whyNotAlternativeStrategies: [
        "DOM/SVG preview cannot express the per-pixel raster warp for photographic sources.",
        "WebGL/WebGPU would duplicate the proven plugin engine for no measured need at the enforced source cap.",
      ],
    },
    scenarios: [
      {
        automated: true,
        automatedTestName: "performance scenario: initial render path stays canonical",
        browser: true,
        browserTestName: browserPathTestName(
          WARP_PERFORMANCE_PATH_IDS.initialRender,
        ),
        coversTargets: ["source.file"],
        expectedObservable:
          "The warped source is visible on the product canvas after first load.",
        fixture: "uploaded badge source at the compiled workload",
        id: "perf-initial-render",
        interaction: "initial-render",
        pathId: WARP_PERFORMANCE_PATH_IDS.initialRender,
      },
      {
        automated: true,
        automatedTestName: "performance scenario: media import path stays canonical",
        browser: true,
        browserTestName: browserPathTestName(
          WARP_PERFORMANCE_PATH_IDS.mediaImport,
        ),
        coversTargets: ["source.file"],
        expectedObservable:
          "A newly uploaded source decodes and renders warped on the product canvas.",
        fixture: "generated source of the compiled megapixel size",
        id: "perf-media-import",
        interaction: "media-import",
        pathId: WARP_PERFORMANCE_PATH_IDS.mediaImport,
        target: "source.file",
      },
      {
        automated: true,
        automatedTestName: "performance scenario: control drag path stays canonical",
        browser: true,
        browserTestName: browserPathTestName(
          WARP_PERFORMANCE_PATH_IDS.controlDrag,
        ),
        controlLabel: "Horizontal",
        coversTargets: [
          "canvas.renderScale",
          "warp.amount",
          "warp.bend",
          "warp.depth",
          "warp.horizontal",
          "warp.radius",
          "warp.vertical",
        ],
        expectedObservable:
          "The warped output updates live on the product canvas while a warp slider is dragged.",
        fixture: "uploaded badge source at the compiled workload",
        id: "perf-control-drag",
        interaction: "control-drag",
        pathId: WARP_PERFORMANCE_PATH_IDS.controlDrag,
        target: "warp.horizontal",
        uiSelector: "canvas[data-toolcraft-product-output]",
      },
      {
        automated: true,
        automatedTestName:
          "performance scenario: control change path stays canonical",
        browser: true,
        browserTestName: browserPathTestName(
          WARP_PERFORMANCE_PATH_IDS.controlChange,
        ),
        controlLabel: "Effect",
        coversTargets: [
          "warp.clip",
          "warp.direction",
          "warp.effect",
          "warp.round",
        ],
        expectedObservable:
          "Switching the warp effect re-renders the product canvas with the new projection.",
        fixture: "uploaded badge source at the compiled workload",
        id: "perf-control-change",
        interaction: "control-change",
        pathId: WARP_PERFORMANCE_PATH_IDS.controlChange,
        target: "warp.effect",
      },
      {
        automated: true,
        automatedTestName: "performance scenario: viewport drag path stays canonical",
        browser: true,
        browserTestName: browserPathTestName(
          WARP_PERFORMANCE_PATH_IDS.viewportDrag,
        ),
        coversTargets: ["canvas.offset"],
        expectedObservable:
          "Panning moves the viewport while the warped backing stays untouched.",
        fixture: "uploaded badge source at the compiled workload",
        id: "perf-viewport-drag",
        interaction: "viewport-drag",
        pathId: WARP_PERFORMANCE_PATH_IDS.viewportDrag,
      },
      {
        automated: true,
        automatedTestName: "performance scenario: viewport zoom path stays canonical",
        browser: true,
        browserTestName: browserPathTestName(
          WARP_PERFORMANCE_PATH_IDS.viewportZoom,
        ),
        coversTargets: ["canvas.zoom"],
        expectedObservable:
          "Zooming rescales the viewport presentation while the warped backing stays untouched.",
        fixture: "uploaded badge source at the compiled workload",
        id: "perf-viewport-zoom",
        interaction: "viewport-zoom",
        pathId: WARP_PERFORMANCE_PATH_IDS.viewportZoom,
      },
      {
        actionValue: "export.png",
        automated: true,
        automatedTestName: "performance scenario: export path stays canonical",
        browser: true,
        browserTestName: browserPathTestName(WARP_PERFORMANCE_PATH_IDS.export),
        completionEvidence: "download",
        controlLabel: "Export PNG",
        coversTargets: ["actions.output"],
        expectedObservable:
          "A PNG artifact with the warped source downloads at the selected resolution.",
        fixture: "uploaded badge source at the compiled workload",
        id: "perf-export",
        interaction: "export",
        pathId: WARP_PERFORMANCE_PATH_IDS.export,
      },
    ],
    usesCustomRenderer: true,
    workloadEnvelope: {
      dimensions: [
        {
          batchMax: 16.8,
          defaultValue: 1,
          id: WARP_DIMENSION_SOURCE_MEGAPIXELS,
          interactiveMax: 16.8,
          mapping: "direct",
          source: { id: "uploaded-source", kind: "external-input" },
          unit: "megapixels",
        },
        {
          batchMax: 8192,
          defaultValue: 4096,
          id: WARP_DIMENSION_EXPORT_LONG_EDGE,
          mapping: "direct",
          source: { kind: "schema-target", target: "export.image.resolution" },
          unit: "px",
        },
      ],
    },
  });
