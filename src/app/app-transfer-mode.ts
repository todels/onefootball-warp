import type { ToolcraftTransferMode } from "./acceptance/types";

/** Primary SVG-delivery request evidence; interpretation recorded in the worklog. */
export const svgRequestEvidence = {
  messageRef:
    "/Users/ludde/.claude/projects/-Users-ludde-Repos-plugin/99b6e3cd-28d4-49eb-be8a-daf754c538fb.jsonl#user-message-onefootball-web-tool",
  messageText:
    "yo i need you to quickly create a web tool of this (not related to this plugin really too much) with the same functions but a web variant and it should be branded for onefootball",
  quote: "with the same functions but a web variant",
  source: "user-message",
} as const;

export const appTransferMode: ToolcraftTransferMode = {
  animationIntent: { mode: "none" },
  behaviorCoverage: ["canvas-sizing", "control-mapping", "export-copy", "media-lifecycle", "renderer-state"],
  mode: "reference-runtime-clone",
  referenceFeatureInventory: [
    {
      acceptanceId: "warp.effect",
      behaviorEvidence:
        "Ran the plugin and its standalone web variant: the Perspective/Sphere/Arc tabs swap the visible parameter set and re-project the live preview.",
      featureName: "Effect tabs (Perspective / Sphere / Arc)",
      id: "effect-tabs",
      referenceBehavior:
        "Three tabs choose the warp engine; each shows its own parameter controls.",
      sourceEvidence: "../ui.html setMode/tab wiring and mode-specific control groups.",
      status: "ported",
      toolcraftMapping:
        "One `tabs` control on warp.effect with conditional applicability on every effect parameter.",
      },
    {
      acceptanceId: "warp.horizontal",
      behaviorEvidence:
        "Ran the plugin: dragging Horizontal/Vertical/Depth re-projects the preview live through makeProjector.",
      featureName: "Perspective parameters",
      id: "perspective-params",
      referenceBehavior:
        "Horizontal ±90°, Vertical ±90°, Depth 0–100 drive the homography.",
      sourceEvidence: "../ui.html makeProjector and yaw/pitch/depth sliders.",
      status: "ported",
      toolcraftMapping:
        "Sliders on warp.horizontal / warp.vertical / warp.depth with identical ranges feeding the same spliced engine.",
    },
    {
      acceptanceId: "warp.effect",
      behaviorEvidence:
        "Ran the plugin: Amount/Radius drive the sin-hemisphere bulge live.",
      featureName: "Sphere parameters",
      id: "sphere-params",
      referenceBehavior: "Amount ±100 and Radius 25–150 drive makeBulge.",
      sourceEvidence: "../ui.html makeBulge and amount/radius sliders.",
      status: "ported",
      toolcraftMapping:
        "Sliders on warp.amount / warp.radius with identical ranges feeding the same engine.",
    },
    {
      acceptanceId: "warp.effect",
      behaviorEvidence:
        "Ran the plugin: the round toggle switches to the isotropic 1:1 sphere; clip trims geometry at the rim.",
      featureName: "Sphere round and clip toggles",
      id: "sphere-toggles",
      referenceBehavior:
        "Round wraps onto a perfect sphere; Clip cuts geometry outside the rim.",
      sourceEvidence: "../ui.html makeBulge round flag and clip region handling.",
      status: "ported",
      toolcraftMapping: "Switches on warp.round / warp.clip.",
    },
    {
      acceptanceId: "warp.effect",
      behaviorEvidence:
        "Ran the plugin: Bend arcs the artwork; Direction flips between horizontal and vertical bending.",
      featureName: "Arc bend and direction",
      id: "arc-params",
      referenceBehavior:
        "Bend ±100 drives makeArc; a Horizontal/Vertical segmented control picks the axis.",
      sourceEvidence: "../ui.html makeArc and dir-h/dir-v wiring.",
      status: "ported",
      toolcraftMapping:
        "Slider on warp.bend plus a Direction select on warp.direction.",
    },
    {
      acceptanceId: "export.svg",
      behaviorEvidence:
        "Ran the plugin and web variant: vector sources warp into editable vector output (warpSvg).",
      featureName: "Vector warp with SVG delivery",
      id: "svg-delivery",
      referenceBehavior:
        "The plugin's core purpose: warp SVG shapes and write back editable vectors.",
      sourceEvidence: "../ui.html warpSvgDoc/warpSvg.",
      status: "ported",
      toolcraftMapping:
        "svgExportModule with scene.vectorFrameRenderer appending the warped vector nodes.",
    },
    {
      acceptanceId: "export.image",
      behaviorEvidence:
        "Ran the plugin: raster layers warp through inverse sampling (warpRaster) with fold rejection.",
      featureName: "Raster warp",
      id: "raster-warp",
      referenceBehavior:
        "Image content is inverse-sampled per pixel through the shared projection.",
      sourceEvidence: "../ui.html warpRaster/makeInverseSampler.",
      status: "ported",
      toolcraftMapping:
        "The same engine draws the shared raster export frame for PNG/JPG artifacts.",
    },
    {
      acceptanceId: "source.upload",
      behaviorEvidence:
        "Ran the plugin: it reads the active Figma selection as its source; the user asked for a standalone web variant instead.",
      featureName: "Source acquisition",
      id: "source-acquisition",
      referenceBehavior:
        "The plugin captures the selected Figma layer (vector, group, or image) as the warp source.",
      sourceEvidence: "../code.js captureSource/pushSelection.",
      status: "intentionally-changed",
      toolcraftMapping:
        "A fileDrop upload (SVG/PNG/JPG/WebP) replaces the Figma selection as the source.",
      userApprovedChangeReason:
        'User: "quickly create a web tool of this (not related to this plugin really too much) with the same functions but a web variant" — the web variant has no Figma document, so sources are uploads.',
    },
    {
      acceptanceId: "export.image",
      behaviorEvidence:
        "Ran the plugin: Apply edits the selected Figma layer in place; the web variant delivers artifacts instead.",
      featureName: "In-place canvas apply",
      id: "in-place-apply",
      referenceBehavior:
        "Apply writes warped geometry back onto the selected Figma node non-destructively.",
      sourceEvidence: "../code.js applyPerspective.",
      status: "intentionally-changed",
      toolcraftMapping:
        "Runtime-owned PNG/JPG/SVG export delivers the warped result as files.",
      userApprovedChangeReason:
        'User: "a web variant" — there is no host document to edit in place on the web; delivery is by export.',
    },
    {
      acceptanceId: "warp.horizontal",
      behaviorEvidence:
        "Ran the plugin: Live mode debounces writes to the canvas while the preview always tracks the drag.",
      featureName: "Live preview while dragging",
      id: "live-preview",
      referenceBehavior:
        "The panel preview re-renders during every slider drag.",
      sourceEvidence: "../ui.html schedulePreview/drawPreview.",
      status: "ported",
      toolcraftMapping:
        "The product canvas re-renders on every committed slider value during the drag.",
    },
    {
      acceptanceId: "canvas.infinity-mode",
      behaviorEvidence:
        "Ran the plugin: its preview is a fixed panel window; the web variant exposes the Toolcraft editable artboard plus Infinity mode, verified by toggling Infinity with the warped scene mounted.",
      featureName: "Preview framing and canvas sizing",
      id: "canvas-sizing",
      referenceBehavior:
        "The plugin frames the warp in a fixed panel preview window with no user-sizable canvas.",
      sourceEvidence: "../ui.html preview window framing (warpSvgPreview).",
      status: "intentionally-changed",
      toolcraftMapping:
        "Runtime editable-output canvas: artboard sizing in Setup plus Infinity mode, with the warped scene fitted into the product frame in both modes.",
      userApprovedChangeReason:
        'User: "a web variant ... use toolcraft as the UI framework" — the Toolcraft shell owns canvas sizing on the web.',
    },
  ],
  referenceInputs: [],
  referenceName: "Perspectivo – Vector Tool (Figma plugin, ../ui.html + ../code.js)",
  referenceStudy: {
    behaviorEvidence:
      "Exercised all three effects, toggles, and exports in both reference runtimes; verified warp math parity (same spliced engine, ≤1.5px registration in prior plugin verification).",
    referenceLocation:
      "/Users/ludde/Repos/plugin (published Figma plugin: ui.html, code.js) and /Users/ludde/Repos/plugin/onefootball-web/index.html (standalone web variant).",
    reproductionSteps:
      "Loaded the plugin panel UI and the standalone onefootball-web/index.html in a browser; uploaded SVG and raster fixtures; drove every effect tab, slider, and toggle; exported SVG and PNG.",
    sourceEvidence:
      "Read ui.html (engine + panel wiring) and code.js (capture/apply) in full during the port; the engine here is spliced verbatim from ui.html.",
    status: "ran-original",
  },
  referenceTimeline: { behaviorCoverage: [], mode: "none" },
  sourceOfTruth: "reference-runtime",
};
