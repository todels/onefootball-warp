import type {
  ToolcraftComponentAcceptance,
  ToolcraftControlSectionInventoryEntry,
  ToolcraftProductReadiness,
} from "./acceptance/types";
import { appSchema } from "./app-schema";
import { svgRequestEvidence } from "./app-transfer-mode";

export { appTransferMode } from "./app-transfer-mode";

const persistenceSlices =
  appSchema.persistence.storage === "localStorage"
    ? appSchema.persistence.include
    : [];

export const appProductReadiness: ToolcraftProductReadiness = {
  exportIntent: {
    image: { mode: "toolcraft-default" },
    svg: { evidence: svgRequestEvidence, mode: "user-requested" },
    video: { mode: "not-requested" },
  },
  interactionOwnership: [
    {
      alternative: {
        reason:
          "Canvas-side warp handles would duplicate the reference's slider-driven operation with new chrome and obscure the artwork.",
        surface: "canvas",
      },
      capability: "property-edit",
      evidence: {
        detail:
          "The inspected reference (Perspectivo plugin) edits every warp parameter through panel sliders and toggles while the canvas shows live output only.",
        source: "reference",
      },
      id: "warp-parameter-editing",
      selectionScope: { mode: "global" },
      reason:
        "Panel sliders give precise, discoverable parameter editing with the canvas free for live output, matching the reference.",
      surface: "panel",
      target: "warp.effect",
    },
  ],
  mode: "product",
  productName: "Onefootball Warp",
  productSummary:
    "Warps an uploaded SVG or image through the Perspectivo engine's Perspective, Sphere, and Arc projections and exports the result.",
  requestedBehavior:
    "A OneFootball-branded web variant of the Perspectivo Figma plugin: upload artwork, warp it with the same three effects and parameters, and download the result (including editable SVG).",
  viewInteraction: {
    mode: "non-spatial",
    reason:
      "The product warps flat 2D artwork; there is no three-dimensional scene or model to orbit. The inspected reference drives the perspective projection exclusively through panel sliders.",
  },
};

export const appAcceptance: readonly ToolcraftComponentAcceptance[] = [
  {
    automated: true,
    automatedTestName: "source upload accepts svg and raster files and caps sampling",
    browser: {
      budget: "extended-io",
      file: "e2e/product-source.spec.ts",
      testName: "browser: uploading, removing, and resetting the source drives the warped canvas",
    },
    componentType: "fileDrop",
    evidence: "media-lifecycle",
    expectedObservable:
      "The default OneFootball logo renders on load; an uploaded source replaces it; removing clears the canvas; Reset restores the default logo.",
    fixture: "generated SVG badge and raster fixture files",
    id: "source.upload",
    kind: "control",
    mediaLifecycleCoverage: ["default-remove", "default-reset", "remove", "reset", "upload"],
    referenceCoverage: "media-lifecycle",
    target: "source.file",
    userAction:
      "Remove the default logo, upload a file, remove it, and reset controls to restore the default.",
  },
  {
    automated: true,
    automatedTestName: "effect tabs map to the three engine projections",
    browser: {
      budget: "standard",
      file: "e2e/product-warp.spec.ts",
      testName: "browser: effect tabs switch the projection and the visible parameter set",
    },
    componentType: "tabs",
    evidence: "product-output",
    expectedObservable:
      "Each tab re-renders the canvas with its projection and shows only its own parameter controls.",
    fixture: "uploaded SVG badge with a non-identity parameter per effect",
    id: "warp.effect",
    interactionId: "warp-parameter-editing",
    kind: "control",
    optionCoverage: "each-visible-item",
    referenceCoverage: "control-mapping",
    target: "warp.effect",
    userAction: "Click Perspective, Sphere, and Arc in turn.",
  },
  {
    automated: true,
    automatedTestName: "horizontal angle changes the perspective projection",
    browser: {
      budget: "standard",
      file: "e2e/product-warp.spec.ts",
      testName: "browser: dragging Horizontal re-projects the canvas live",
    },
    componentType: "slider",
    evidence: "product-output",
    expectedObservable:
      "The warped artwork visibly re-projects while the thumb is still being dragged.",
    fixture: "uploaded SVG badge on the Perspective tab",
    id: "warp.horizontal",
    kind: "control",
    referenceCoverage: "renderer-state",
    target: "warp.horizontal",
    userAction: "Drag the Horizontal slider thumb.",
  },
  {
    automated: true,
    automatedTestName: "vertical angle changes the perspective projection",
    browser: {
      budget: "standard",
      file: "e2e/product-warp.spec.ts",
      testName: "browser: dragging Vertical re-projects the canvas live",
    },
    componentType: "slider",
    evidence: "product-output",
    expectedObservable:
      "The warped artwork visibly re-projects while the thumb is still being dragged.",
    fixture: "uploaded SVG badge on the Perspective tab",
    id: "warp.vertical",
    kind: "control",
    target: "warp.vertical",
    userAction: "Drag the Vertical slider thumb.",
  },
  {
    automated: true,
    automatedTestName: "depth changes the perspective focal strength",
    browser: {
      budget: "standard",
      file: "e2e/product-warp.spec.ts",
      testName: "browser: dragging Depth changes the projection strength live",
    },
    componentType: "slider",
    evidence: "product-output",
    expectedObservable:
      "With a non-zero angle, the foreshortening visibly changes during the drag.",
    fixture: "uploaded SVG badge with Horizontal at 30°",
    id: "warp.depth",
    kind: "control",
    target: "warp.depth",
    userAction: "Drag the Depth slider thumb.",
  },
  {
    automated: true,
    automatedTestName: "sphere amount bulges the artwork",
    browser: {
      budget: "standard",
      file: "e2e/product-warp.spec.ts",
      testName: "browser: dragging Amount bulges the canvas live",
    },
    componentType: "slider",
    evidence: "product-output",
    expectedObservable:
      "The artwork visibly domes outward (or pinches inward) during the drag.",
    fixture: "uploaded SVG badge on the Sphere tab",
    id: "warp.amount",
    kind: "control",
    target: "warp.amount",
    userAction: "Drag the Amount slider thumb.",
  },
  {
    automated: true,
    automatedTestName: "sphere radius scales the bulge region",
    browser: {
      budget: "standard",
      file: "e2e/product-warp.spec.ts",
      testName: "browser: dragging Radius rescales the bulge live",
    },
    componentType: "slider",
    evidence: "product-output",
    expectedObservable:
      "With a non-zero amount, the bulge footprint visibly changes during the drag.",
    fixture: "uploaded SVG badge with Amount at 60",
    id: "warp.radius",
    kind: "control",
    target: "warp.radius",
    userAction: "Drag the Radius slider thumb.",
  },
  {
    automated: true,
    automatedTestName: "round toggle switches to the isotropic sphere",
    browser: {
      budget: "standard",
      file: "e2e/product-warp.spec.ts",
      testName: "browser: toggling Perfectly round changes the bulge shape",
    },
    componentType: "switch",
    evidence: "product-output",
    expectedObservable:
      "On a wide source with a non-zero amount, the bulge visibly becomes circular.",
    fixture: "uploaded wide SVG with Amount at 60",
    id: "warp.round",
    kind: "control",
    target: "warp.round",
    userAction: "Toggle Perfectly round.",
  },
  {
    automated: true,
    automatedTestName: "clip toggle trims geometry outside the sphere rim",
    browser: {
      budget: "standard",
      file: "e2e/product-warp.spec.ts",
      testName: "browser: toggling Clip to sphere trims the output",
    },
    componentType: "switch",
    evidence: "product-output",
    expectedObservable:
      "With a non-zero amount, corners outside the rim visibly disappear.",
    fixture: "uploaded wide SVG with Amount at 60",
    id: "warp.clip",
    kind: "control",
    target: "warp.clip",
    userAction: "Toggle Clip to sphere.",
  },
  {
    automated: true,
    automatedTestName: "arc bend curves the artwork",
    browser: {
      budget: "standard",
      file: "e2e/product-warp.spec.ts",
      testName: "browser: dragging Bend arcs the canvas live",
    },
    componentType: "slider",
    evidence: "product-output",
    expectedObservable: "The artwork visibly arcs during the drag.",
    fixture: "uploaded SVG badge on the Arc tab",
    id: "warp.bend",
    kind: "control",
    target: "warp.bend",
    userAction: "Drag the Bend slider thumb.",
  },
  {
    automated: true,
    automatedTestName: "arc direction switches the bend axis",
    browser: {
      budget: "standard",
      file: "e2e/product-warp.spec.ts",
      testName: "browser: switching Direction re-arcs the canvas on the other axis",
    },
    componentType: "select",
    evidence: "product-output",
    expectedObservable:
      "With a non-zero bend, the arc axis visibly flips between horizontal and vertical.",
    fixture: "uploaded SVG badge with Bend at 45",
    id: "warp.direction",
    kind: "control",
    optionCoverage: "each-visible-item",
    target: "warp.direction",
    userAction: "Choose Vertical, then Horizontal, in Direction.",
  },
  {
    automated: true,
    automatedTestName: "background switch declares the runtime fill pair",
    backgroundOutputCoverage: "all-required-background-output",
    browser: {
      budget: "standard",
      file: "e2e/product-background.spec.ts",
      testName: "browser: background switch controls preview fill and PNG transparency",
    },
    componentType: "switch",
    evidence: "rendered-pixels",
    expectedObservable:
      "Turning Background off removes the fill behind the artwork and exports transparent PNG pixels; turning it on restores both.",
    fixture: "uploaded SVG badge with a visible background color",
    id: "background.include",
    kind: "control",
    target: "export.includeBackground",
    userAction: "Toggle Background in Settings and export PNG in both states.",
  },
  {
    automated: true,
    automatedTestName: "background color declares the runtime fill color",
    browser: {
      budget: "standard",
      file: "e2e/product-background.spec.ts",
      testName: "browser: background color changes the fill behind the artwork",
    },
    componentType: "color",
    evidence: "rendered-pixels",
    expectedObservable:
      "Editing Background color visibly recolors the fill behind the warped artwork.",
    fixture: "uploaded SVG badge with Background on",
    id: "background.color",
    kind: "control",
    target: "appearance.background",
    userAction: "Enter a different hex value in Background color.",
  },
  {
    automated: true,
    automatedTestName: "render scale resolves to the canonical enabled slider",
    browser: {
      budget: "standard",
      file: "e2e/product-canvas.spec.ts",
      testName: "browser: resolution scale keeps css size and scales backing pixels",
    },
    componentType: "runtime",
    evidence: "rendered-pixels",
    expectedObservable:
      "Backing pixels equal CSS size × devicePixelRatio × selected scale in interaction and steady states while CSS size stays fixed.",
    fixture: "uploaded SVG badge",
    id: "canvas.render-scale",
    kind: "runtime",
    renderScaleCoverage: {
      kind: "selected-backing-pixels",
      states: ["interaction", "steady"],
    },
    target: "canvas.renderScale",
    userAction: "Move Resolution scale between 1 and 2 while dragging a warp slider.",
  },
  {
    automated: true,
    automatedTestName: "workspace persistence keeps the resolved slices",
    browser: {
      budget: "extended-io",
      file: "e2e/product-persistence.spec.ts",
      testName: "browser: the warped workspace survives a browser reload",
    },
    componentType: "persistence",
    evidence: "persistence-state",
    expectedObservable:
      "After reload, the uploaded source, warp values, canvas size, and panel state are restored and the warped output re-renders.",
    fixture: "uploaded SVG badge with Horizontal at 30°",
    id: "persistence.reload",
    kind: "runtime",
    persistenceCoverage: "reload",
    persistenceSlices: persistenceSlices,
    target: "canvas.size.width",
    userAction:
      "Upload a source, set Horizontal, edit Canvas width, collapse a section, wait for save, and reload.",
  },
  {
    automated: true,
    automatedTestName: "image export renders the warped frame deterministically",
    browser: {
      budget: "extended-io",
      file: "e2e/product-export.spec.ts",
      testName: "browser: still export delivers PNG and JPG with the warped artwork",
    },
    componentType: "panelActions",
    evidence: "exported-bytes",
    actionCoverage: ["export.png", "export.svg"],
    exportArtifactCoverage: "all-required-image-export-behavior",
    expectedObservable:
      "PNG and JPG downloads decode at the selected 2K/4K/8K size with the warped artwork's pixels.",
    fixture: "uploaded SVG badge with Horizontal at 30°",
    id: "export.image",
    kind: "control",
    referenceCoverage: "export-copy",
    target: "actions.output",
    userAction:
      "Select each format and resolution in Image Export and click the still export action.",
  },
  {
    automated: true,
    automatedTestName: "svg export appends self-contained warped vectors",
    browser: {
      budget: "extended-io",
      file: "e2e/product-export.spec.ts",
      testName: "browser: svg export downloads self-contained editable warped vectors",
    },
    componentType: "panelActions",
    evidence: "exported-bytes",
    actionCoverage: ["export.svg"],
    exportArtifactCoverage: "all-required-svg-export-behavior",
    expectedObservable:
      "Selecting SVG and exporting downloads a strict, self-contained vector artifact containing the warped geometry.",
    fixture: "uploaded SVG badge with Horizontal at 30°",
    id: "export.svg",
    kind: "runtime",
    referenceCoverage: "export-copy",
    target: "actions.output",
    userAction: "Select SVG in Image Export's Format and click Export SVG.",
  },
  {
    automated: true,
    automatedTestName: "image export format options map to typed artifact actions",
    browser: {
      budget: "standard",
      file: "e2e/product-export.spec.ts",
      testName: "browser: image format selection switches the still export action",
    },
    componentType: "select",
    evidence: "command-side-effect",
    expectedObservable:
      "Selecting PNG, JPG, or SVG relabels the sticky still-export action to match.",
    fixture: "uploaded SVG badge",
    id: "export.image.format",
    kind: "control",
    optionCoverage: "each-visible-item",
    target: "export.image.format",
    userAction: "Choose each Format option in Image Export.",
  },
  {
    automated: true,
    automatedTestName: "image export resolution options resolve real pixel sizes",
    browser: {
      budget: "standard",
      file: "e2e/product-export.spec.ts",
      testName: "browser: image resolution selection commits and hides during svg",
    },
    componentType: "select",
    evidence: "command-side-effect",
    expectedObservable:
      "Each resolution option commits; the control disappears while SVG is selected and returns with its retained value.",
    fixture: "uploaded SVG badge",
    id: "export.image.resolution",
    kind: "control",
    optionCoverage: "each-visible-item",
    target: "export.image.resolution",
    userAction: "Choose each Resolution option, switch Format to SVG and back.",
  },
  {
    automated: true,
    automatedTestName: "infinity mode preserves the product frame and dormant size",
    browser: {
      budget: "standard",
      file: "e2e/product-canvas.spec.ts",
      testName: "browser: infinity canvas preserves the warped scene and restores the finite artboard",
    },
    componentType: "runtime",
    evidence: "viewport-side-effect",
    expectedObservable:
      "Toggling Infinity removes only the artboard boundary and size controls; the warped scene, renderer, backing, and dormant finite size survive pan, reload, undo, and redo.",
    fixture: "uploaded SVG badge",
    id: "canvas.infinity-mode",
    infinityCanvasCoverage: "mode-continuity-and-restoration",
    kind: "runtime",
    referenceCoverage: "canvas-sizing",
    target: "canvas.infinity",
    userAction:
      "Toggle Infinity canvas on, pan, reload, toggle it off, undo, and redo.",
  },
  {
    automated: true,
    automatedTestName: "infinity image export matches the finite artifact frame",
    browser: {
      budget: "extended-io",
      file: "e2e/product-export.spec.ts",
      testName: "browser: infinity png export matches the finite artifact",
    },
    componentType: "runtime",
    evidence: "exported-bytes",
    expectedObservable:
      "PNG exported in Infinity mode has the same dimensions and decoded pixels as the finite export of the same scene.",
    fixture: "uploaded SVG badge",
    id: "export.image.infinity",
    infinityCanvasCoverage: "scene-bounds-image-export",
    kind: "runtime",
    target: "canvas.infinity",
    userAction: "Export PNG in finite mode, enable Infinity, export again.",
  },
  {
    automated: true,
    automatedTestName: "infinity svg export matches the finite artifact frame",
    browser: {
      budget: "extended-io",
      file: "e2e/product-export.spec.ts",
      testName: "browser: infinity svg export matches the finite artifact",
    },
    componentType: "runtime",
    evidence: "exported-bytes",
    expectedObservable:
      "SVG exported in Infinity mode keeps the same viewBox, vector content, and background as the finite export.",
    fixture: "uploaded SVG badge",
    id: "export.svg.infinity",
    infinityCanvasCoverage: "scene-bounds-svg-export",
    kind: "runtime",
    target: "canvas.infinity",
    userAction: "Export SVG in finite mode, enable Infinity, export again.",
  },
];


export const appControlSectionInventory: readonly ToolcraftControlSectionInventoryEntry[] =
  [
    {
      entity: "Source artwork",
      entityId: "source",
      finiteSelectors: [],
      groupingReason: "One uploaded file is the single warp source.",
      id: "source",
      targets: ["source.file"],
      title: "Source",
    },
    {
      entity: "Warp effect",
      entityId: "warp",
      finiteSelectors: [
        {
          affectedTargets: [],
          reason:
            "The effect tab chooses the projection; every parameter is gated on it through explicit applicability predicates.",
          role: "branch",
          target: "warp.effect",
        },
        {
          reason: "Direction flips the arc axis without changing peer relevance.",
          role: "parameter",
          target: "warp.direction",
        },
        {
          reason:
            "Round switches the sphere mapping's aspect handling without changing peer relevance.",
          role: "parameter",
          target: "warp.round",
        },
        {
          reason:
            "Clip trims output at the sphere rim without changing peer relevance.",
          role: "parameter",
          target: "warp.clip",
        },
      ],
      groupingReason:
        "One projection with its parameters: the effect selector and its dependent sliders and toggles form a single edit task and reset scope.",
      id: "warp",
      targets: [
        "warp.effect",
        "warp.horizontal",
        "warp.vertical",
        "warp.depth",
        "warp.amount",
        "warp.radius",
        "warp.round",
        "warp.clip",
        "warp.bend",
        "warp.direction",
      ],
      title: "Warp",
    },
    {
      entity: "Background",
      entityId: "background",
      finiteSelectors: [
        {
          reason:
            "The switch controls runtime preview fill and artifact alpha without changing peer relevance.",
          role: "parameter",
          target: "export.includeBackground",
        },
      ],
      groupingReason:
        "The standard background source pair; runtime relocates it into Setup.",
      id: "background",
      targets: ["export.includeBackground", "appearance.background"],
      title: "Background",
    },
    {
      entity: "Image Export",
      entityId: "runtime.image-export",
      finiteSelectors: [
        {
          affectedTargets: [],
          reason:
            "Format chooses the typed still artifact and gates the raster-only Resolution control through its applicability predicate.",
          role: "branch",
          target: "export.image.format",
        },
        {
          reason:
            "Resolution changes only the exported raster's pixel size.",
          role: "parameter",
          target: "export.image.resolution",
        },
      ],
      groupingReason:
        "The runtime-contributed artifact settings pair for the still export action.",
      id: "runtime.image-export",
      targets: ["export.image.format", "export.image.resolution"],
      title: "Image Export",
    },
  ];
