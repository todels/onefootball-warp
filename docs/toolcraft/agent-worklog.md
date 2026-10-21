# Agent Worklog

## Status

Mode: product
Active change: onefootball-warp-first-delivery
First delivery of the Onefootball Warp product (reference-runtime-clone port of the Perspectivo Figma plugin).

## Decisions

- Vendor the proven Perspectivo engine verbatim as the local package `vendor/perspectivo-warp` (external dependency), keeping imperative SVG/DOM work outside product source per the AST boundary; product modules hold only schema, layout math, React canvas, and runtime ports.
- One shared deterministic layout (`computeSceneLayout`, the plugin's fixed preview window) for preview, raster artifacts, and SVG artifacts; the product frame is the artboard rect in both canvas modes with warped output fitted inside it (intrinsic scene bounds).
- Effect selection is ordinary dependency cohesion (tabs + conditional applicability), not a `productMode`; `warp.effect` is the only branch selector.
- Image export stays default; SVG export is explicitly user-requested ("the same functions" of a plugin whose core function is warping SVG shapes and exporting SVG); video not requested.
- The uploaded-source magnitude is modeled as the external-input `source-megapixels` dimension with the enforced 4096px sampling cap; the fileDrop control itself is responsiveness-class.

## Evidence

- Source reviewed: ../ui.html (engine + panel wiring; engine spliced verbatim), ../code.js (capture/apply semantics), ../onefootball-web/index.html (standalone variant, run in a browser), and local contracts AGENTS.md plus docs/toolcraft/{workflow, core/runtime-boundary, assembly-workflow, core/control-selection, core/layout, core/setup-export, core/media-upload, core/performance, core/reference-study, core/slider-ranges, schema-reference, component-rules, renderer-technique, decision-contract, performance, acceptance-testing}.md.
- Contract applied: runtime-shell-required; canvas-no-app-ui; controls-product-coverage; controls-section-inventory-required; output-export-required; reference-clone-source-of-truth; renderer-technique-inventory; renderer-view-interaction; interaction-surface-ownership; persistence-policy-explicit; performance-coverage-levels.
- Evidence: render-plan assessment returns no structural errors; the canvas-2d vs webgl kernel benchmark requirement for `warp-rasterize` remains pending (first delivery defers it).

## Decision Trail

### onefootball-warp-first-delivery — Port the Perspectivo warp tool as a OneFootball-branded Toolcraft web app

- Change ID: onefootball-warp-first-delivery
- Request: "yo i need you to quickly create a web tool of this (not related to this plugin really too much) with the same functions but a web variant and it should be branded for onefootball" followed by "ok yeah use toolcraft as the UI framework thank you".
- Task type: reference-runtime-clone port of an existing app (the published Perspectivo Figma plugin at /Users/ludde/Repos/plugin) into a generated Toolcraft product.
- User-visible result: upload an SVG or raster image, warp it live with the plugin's three effects (Perspective yaw/pitch/depth, Sphere amount/radius/round/clip, Arc bend/direction with identical ranges), and export the result as PNG/JPG at 2K/4K/8K or as a self-contained editable SVG.
- Source/reference checked: ../ui.html (panel + engine; the engine here is spliced verbatim into src/app/warp/perspectivo-engine.js — regenerate by re-running the splice of ui.html's script between `'use strict'` and the "UI wiring" marker), ../code.js (capture/apply semantics), and the standalone web variant ../onefootball-web/index.html which was run in a browser during the port.
- Reference inputs: None (no motion references; `referenceInputs: []`).
- Docs/contracts read: workflow.md; core/runtime-boundary.md; assembly-workflow.md; core/control-selection.md; core/layout.md; core/setup-export.md; core/media-upload.md; core/performance.md; core/reference-study.md; core/slider-ranges.md; schema-reference.md; component-rules.md; renderer-technique.md; decision-contract.md; performance.md; acceptance-testing.md.
- Contract rules applied: runtime-shell-required; canvas-no-app-ui; controls-product-coverage; controls-section-inventory-required; output-export-required; reference-clone-source-of-truth; renderer-technique-inventory; renderer-view-interaction; interaction-surface-ownership; persistence-policy-explicit; performance-coverage-levels.
- View interaction intent: non-spatial. The product warps flat 2D artwork; the perspective effect is a 2D projective image transform, not an orbitable 3D scene, and the inspected reference drives it exclusively through panel sliders. No gizmo targets.
- Interaction ownership: warp parameter editing is panel-owned (evidence: the inspected reference edits every parameter in the plugin panel while its canvas is output-only); no canvas handles exist, so no operation is mirrored.
- Decision: splice the proven engine verbatim (numerical parity with the plugin by construction) and keep all product behavior in Toolcraft schema state; preview and exports share one deterministic `warpSourceForFrame` layout (the plugin's fixed preview window) so artifacts always match the canvas; the product frame is the artboard rect in both canvas modes, with warped output deterministically fitted inside it (intrinsic scene bounds, no overflow proof needed).
- Alternatives rejected: re-implementing the warp in WebGL/WebGPU (duplicates a proven engine without measured need at the enforced 4096px source cap); DOM/SVG-only preview (cannot express the per-pixel raster warp); iframing the existing onefootball-web variant (forbidden shell replacement); declaring `productMode` application modes for the effect tabs (the effect selector is ordinary dependency cohesion, not a user-requested app mode).
- State/output mapping: `warp.*` values → `buildWarpParams` → engine projection → `warp-rasterize` pass → product canvas (preview) and `scene.rasterFrameRenderer` (PNG/JPG/video-less still artifacts); SVG sources additionally → `scene.vectorFrameRenderer` appending warped vector nodes; `source.file` media → `decode-source` retained resource (4096px sampling cap); `export.includeBackground`/`appearance.background` → runtime-owned background surfaces; `export.image.format`/`export.image.resolution` → runtime artifact actions.
- SVG export request evidence interpretation: the user's primary message asks for "the same functions but a web variant" of the Perspectivo plugin, whose stated core function (original request in the referenced transcript) is "warps SVG shapes and exports them to svg shapes"; the earlier accepted web variant also shipped SVG download/copy. SVG delivery is therefore `user-requested` with that quote; video was never requested and image stays default.
- Verification: first-delivery functional proof via `npm run verify:delivery` (unit tests over engine math/schema wiring plus registered Playwright browser acceptance across e2e/product-warp.spec.ts, e2e/product-media.spec.ts, e2e/product-export.spec.ts); no measured performance was run.
- Risks:
  - Risk: SVG sources rasterize in preview/PNG; vector fidelity is preserved only through the explicit SVG artifact. Mitigated by the shared layout math and the SVG artifact acceptance row.
  - Risk: the spliced engine file must be regenerated (never hand-edited) when the plugin engine changes; drift would break parity. The splice markers are recorded above.

## Renderer

- Decision: custom Canvas 2D renderer (strategy `canvas-2d`) with one compiled pipeline `onefootball-warp-pipeline` (decode-source retained per source, warp-rasterize per interaction, warp-export batch); SVG artifacts come from the engine's vector path, PNG/JPG from the shared raster frame.
- Reason: one surface composites both raster and vector sources deterministically; the engine is CPU-based inverse sampling with an enforced 4096px source cap.
- Evidence: renderer technique inventory in src/app/app-performance.ts; render-plan assessment returns no structural errors; the canvas-2d vs webgl kernel benchmark requirement for warp-rasterize remains visible and pending (first delivery defers it; no measured performance ran).

## View Interaction

- Decision: non-spatial.
- Reason: flat 2D warp output; no 3D scene or model; reference drives projection via sliders.
- Evidence: appProductReadiness.viewInteraction with reason; no orientationGizmo targets.

## Interaction Ownership

- Decision: panel-owned parameter editing; canvas is output-only.
- Reason: matches the inspected reference; precision and discoverability live in the panel.
- Evidence: appProductReadiness.interactionOwnership entry `warp-parameter-editing` (source: reference).

## Timeline

- Decision: no timeline module.
- Reason: no product animation, keyframes, playback, or video delivery; `animationIntent: { mode: "none" }`.
- Evidence: appTransferMode.animationIntent; no timeline switch appears in Setup.

## Layers

- Decision: layers absent.
- Reason: no user-requested layer workflow; a single source upload drives the product.
- Evidence: no layersModule in app-schema.ts.

## Controls

- Decision: three sections — Source (fileDrop), Warp (effect tabs + conditional per-effect parameters), Background (standard pair, relocated by runtime into Setup); `warp.effect` is the single branch selector, `warp.direction`/`warp.round`/`warp.clip`/`export.includeBackground` are parameters.
- Reason: dependency cohesion — one projection and its parameters form one task and reset scope; ranges mirror the plugin exactly.
- Evidence: appControlSectionInventory; applicability browser cases in e2e/product-warp.spec.ts.

## Export

- Decision: image default (PNG/JPG, 2K/4K/8K) plus explicitly requested SVG; no video.
- Reason: exportIntent evidence — SVG is the plugin's core deliverable ("the same functions"); video never requested.
- Evidence: appProductReadiness.exportIntent with structured user-message evidence; svgExportModule + vectorFrameRenderer; artifact rows export.image / export.svg.

## Performance

- Decision: two workload dimensions — `source-megapixels` (external input, hard-capped by the 4096px sampling boundary in src/app/warp/source-cache.ts) and `export-long-edge` (schema select 2k/4k/8k); seven canonical paths derived from the compiled pipeline, one scenario and one browser path adapter each; render scale enabled with selected-backing-pixels coverage.
- Reason: warp cost is linear in sampled source pixels; export adds output-resolution batch cost; sliders are responsiveness-class (constant per-pixel cost).
- Evidence: appPerformance workload envelope, derived path ids in WARP_PERFORMANCE_PATH_IDS, adapters in e2e/app-performance-path-adapters.ts. First delivery runs functional proof only; the pending warp-rasterize kernel benchmark executes only under request-authorized performance work.

## Verification

First-delivery functional proof: `npm run verify:delivery` runs the product unit suite (engine math and schema wiring in src/app/warp/warp-product.test.ts) plus registered Playwright browser acceptance across the six domain specs (e2e/product-warp.spec.ts, e2e/product-source.spec.ts, e2e/product-canvas.spec.ts, e2e/product-persistence.spec.ts, e2e/product-background.spec.ts, e2e/product-export.spec.ts) against the real UI. The protected initial delivery receipt was produced on 2026-10-19 (22 browser acceptance tests, 740 unit/validator tests, one production build). No measured performance was run; the kernel benchmark requirement stays pending until request-authorized performance work. Known environment note: several framework-owned fixture specs in the raw `test:browser` matrix (vector pads, export-job lifecycle fixture, product-mode fixture, canvas trackpad input, settings transfer) fail identically on a pristine untouched scaffold of this Toolcraft release on this machine; they are outside the delivery catalog and unrelated to product behavior.

## Risks

- Risk: SVG sources rasterize in preview/PNG; vector fidelity is preserved only through the explicit SVG artifact (shared layout math plus the SVG artifact acceptance row mitigate).
- Risk: the vendored engine must be regenerated from ../ui.html (splice between `'use strict'` and the "UI wiring" marker), never hand-edited; drift would break parity with the plugin.

## Verification Note

Verification tier: Tier 4 — first delivery of a freshly generated product app.
Reason: complete first product implementation (schema, renderer, exports, acceptance) in a fresh scaffold.
Run: `npm install` (once, done), `npm run verify:delivery`, `npm run dev`; focused `npx vitest run src/app/warp/warp-product.test.ts` during development.
Skip: measured performance (first delivery runs none; the kernel benchmark requirement stays pending), full audit (`verify:perf`, not authorized).
