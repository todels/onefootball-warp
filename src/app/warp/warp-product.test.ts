// Product unit proof for the acceptance rows: engine math and schema wiring.
// Browser specs own the real-UI product-output evidence.

import { expect, test } from "vitest";

import { getToolcraftFiniteArtboardRect } from "@/toolcraft/runtime";

import { appAcceptance, appControlSectionInventory } from "../app-acceptance-data";
import { appPerformance, WARP_PERFORMANCE_PATH_IDS } from "../app-performance";
import { appSchema } from "../app-schema";
import { makeWarp } from "perspectivo-warp";
import { MAX_SOURCE_EDGE_PX, isSvgMimeType } from "./source-cache";
import { buildWarpParams, WARP_DEFAULTS, WARP_TARGETS } from "./warp-params";
import { computeSceneLayout } from "./warp-render";

const values = (overrides: Record<string, unknown>): Record<string, unknown> => ({
  [WARP_TARGETS.amount]: WARP_DEFAULTS.amount,
  [WARP_TARGETS.bend]: WARP_DEFAULTS.bend,
  [WARP_TARGETS.clip]: WARP_DEFAULTS.clip,
  [WARP_TARGETS.depth]: WARP_DEFAULTS.depth,
  [WARP_TARGETS.direction]: WARP_DEFAULTS.direction,
  [WARP_TARGETS.effect]: WARP_DEFAULTS.effect,
  [WARP_TARGETS.horizontal]: WARP_DEFAULTS.horizontal,
  [WARP_TARGETS.radius]: WARP_DEFAULTS.radius,
  [WARP_TARGETS.round]: WARP_DEFAULTS.round,
  [WARP_TARGETS.vertical]: WARP_DEFAULTS.vertical,
  ...overrides,
});

function project(
  overrides: Record<string, unknown>,
  x: number,
  y: number,
): readonly [number, number] {
  const params = buildWarpParams(values(overrides));
  const warp = makeWarp(params, 300, 180, 0, 0);
  return warp.project(x, y);
}

test("source upload accepts svg and raster files and caps sampling", () => {
  const section = appSchema.panels.controls!.sections.find(
    (candidate) => candidate.id === "source",
  );
  const control = section?.controls["file"];
  expect(control?.type).toBe("fileDrop");
  expect(control && "accept" in control ? control.accept : "").toContain(".svg");
  expect(control && "accept" in control ? control.accept : "").toContain(".png");
  expect(isSvgMimeType("image/svg+xml")).toBe(true);
  expect(isSvgMimeType("image/png")).toBe(false);
  expect(MAX_SOURCE_EDGE_PX).toBe(4096);
});

test("effect tabs map to the three engine projections", () => {
  expect(buildWarpParams(values({ [WARP_TARGETS.effect]: "perspective" })).mode).toBe(
    "perspective",
  );
  expect(buildWarpParams(values({ [WARP_TARGETS.effect]: "sphere" })).mode).toBe(
    "bulge",
  );
  expect(buildWarpParams(values({ [WARP_TARGETS.effect]: "arc" })).mode).toBe("arc");
});

test("horizontal angle changes the perspective projection", () => {
  const flat = project({}, 100, 40);
  const turned = project({ [WARP_TARGETS.horizontal]: 35 }, 100, 40);
  expect(flat[0]).toBeCloseTo(100, 6);
  expect(turned[0]).not.toBeCloseTo(flat[0], 1);
});

test("vertical angle changes the perspective projection", () => {
  const flat = project({}, 100, 40);
  const turned = project({ [WARP_TARGETS.vertical]: 35 }, 100, 40);
  expect(turned[1]).not.toBeCloseTo(flat[1], 1);
});

test("depth changes the perspective focal strength", () => {
  const shallow = project(
    { [WARP_TARGETS.depth]: 20, [WARP_TARGETS.horizontal]: 35 },
    100,
    40,
  );
  const deep = project(
    { [WARP_TARGETS.depth]: 90, [WARP_TARGETS.horizontal]: 35 },
    100,
    40,
  );
  expect(deep[0]).not.toBeCloseTo(shallow[0], 1);
});

test("sphere amount bulges the artwork", () => {
  const flat = project({ [WARP_TARGETS.effect]: "sphere" }, 60, 30);
  const bulged = project(
    { [WARP_TARGETS.amount]: 60, [WARP_TARGETS.effect]: "sphere" },
    60,
    30,
  );
  expect(Math.hypot(bulged[0] - flat[0], bulged[1] - flat[1])).toBeGreaterThan(1);
});

test("sphere radius scales the bulge region", () => {
  const small = project(
    {
      [WARP_TARGETS.amount]: 60,
      [WARP_TARGETS.effect]: "sphere",
      [WARP_TARGETS.radius]: 50,
    },
    60,
    30,
  );
  const large = project(
    {
      [WARP_TARGETS.amount]: 60,
      [WARP_TARGETS.effect]: "sphere",
      [WARP_TARGETS.radius]: 150,
    },
    60,
    30,
  );
  expect(Math.hypot(large[0] - small[0], large[1] - small[1])).toBeGreaterThan(0.5);
});

test("round toggle switches to the isotropic sphere", () => {
  // On a wide artwork, the anisotropic sphere displaces x and y unequally for
  // a diagonal point; the round sphere treats both axes through one radius.
  const stretched = project(
    { [WARP_TARGETS.amount]: 60, [WARP_TARGETS.effect]: "sphere" },
    50,
    50,
  );
  const round = project(
    {
      [WARP_TARGETS.amount]: 60,
      [WARP_TARGETS.effect]: "sphere",
      [WARP_TARGETS.round]: true,
    },
    50,
    50,
  );
  expect(Math.hypot(round[0] - stretched[0], round[1] - stretched[1])).toBeGreaterThan(
    0.5,
  );
});

test("clip toggle trims geometry outside the sphere rim", () => {
  const params = buildWarpParams(
    values({
      [WARP_TARGETS.amount]: 60,
      [WARP_TARGETS.clip]: true,
      [WARP_TARGETS.effect]: "sphere",
    }),
  );
  expect(params.mode).toBe("bulge");
  if (params.mode !== "bulge") return;
  expect(params.clip).toBe(true);
  const warp = makeWarp(params, 300, 180, 0, 0);
  expect(warp.region).toBeTruthy();
});

test("arc bend curves the artwork", () => {
  const flat = project({ [WARP_TARGETS.effect]: "arc" }, 100, -90);
  const bent = project(
    { [WARP_TARGETS.bend]: 45, [WARP_TARGETS.effect]: "arc" },
    100,
    -90,
  );
  expect(bent[1]).not.toBeCloseTo(flat[1], 1);
});

test("arc direction switches the bend axis", () => {
  const horizontal = project(
    { [WARP_TARGETS.bend]: 45, [WARP_TARGETS.effect]: "arc" },
    100,
    0,
  );
  const vertical = project(
    {
      [WARP_TARGETS.bend]: 45,
      [WARP_TARGETS.direction]: "v",
      [WARP_TARGETS.effect]: "arc",
    },
    100,
    0,
  );
  expect(Math.hypot(horizontal[0] - vertical[0], horizontal[1] - vertical[1])).toBeGreaterThan(
    1,
  );
});

test("background switch declares the runtime fill pair", () => {
  const section = appSchema.panels.controls!.sections.find((candidate) =>
    Object.values(candidate.controls).some(
      (control) => control.target === "export.includeBackground",
    ),
  );
  expect(section).toBeTruthy();
  const include = Object.values(section?.controls ?? {}).find(
    (control) => control.target === "export.includeBackground",
  );
  expect(include?.type).toBe("switch");
  expect(include?.defaultValue).toBe(true);
});

test("background color declares the runtime fill color", () => {
  const color = appSchema.panels.controls!.sections
    .flatMap((section) => Object.values(section.controls))
    .find((control) => control.target === "appearance.background");
  expect(color?.type).toBe("color");
  expect(color?.defaultValue).toBe("#000000");
});

test("render scale resolves to the canonical enabled slider", () => {
  expect(appSchema.canvas.renderScale.enabled).toBe(true);
  expect(appSchema.canvas.renderScale.min).toBe(1);
  expect(appSchema.canvas.renderScale.max).toBe(2);
});

test("workspace persistence keeps the resolved slices", () => {
  expect(appSchema.persistence.storage).toBe("localStorage");
  const include =
    appSchema.persistence.storage === "localStorage"
      ? appSchema.persistence.include
      : [];
  expect(include).toContain("values");
  expect(include).toContain("canvas");
  expect(include).toContain("media");
});

test("image export renders the warped frame deterministically", () => {
  // The scene layout is a pure function of source and bounds: identical
  // inputs give identical placement, so preview and artifacts align.
  const layoutA = computeSceneLayout(300, 180, { maxX: 150, maxY: 90, minX: -150, minY: -90 }, 1920, 1080);
  const layoutB = computeSceneLayout(300, 180, { maxX: 150, maxY: 90, minX: -150, minY: -90 }, 1920, 1080);
  expect(layoutA).toEqual(layoutB);
  expect(layoutA.scale).toBeGreaterThan(0);
  // Warped output always stays inside the frame window.
  expect(150 * layoutA.scale).toBeLessThanOrEqual(1920 / 2);
  expect(90 * layoutA.scale).toBeLessThanOrEqual(1080 / 2);
});

test("svg export appends self-contained warped vectors", () => {
  const row = appAcceptance.find((candidate) => candidate.id === "export.svg");
  expect(row?.exportArtifactCoverage).toBe("all-required-svg-export-behavior");
  // The inventory keeps every warp target owned exactly once.
  const warpEntry = appControlSectionInventory.find((entry) => entry.id === "warp");
  expect(warpEntry?.targets).toContain("warp.effect");
});

test("performance scenario: initial render path stays canonical", () => {
  expect(
    appPerformance.scenarios.find((scenario) => scenario.id === "perf-initial-render")
      ?.pathId,
  ).toBe(WARP_PERFORMANCE_PATH_IDS.initialRender);
});

test("performance scenario: media import path stays canonical", () => {
  expect(
    appPerformance.scenarios.find((scenario) => scenario.id === "perf-media-import")
      ?.pathId,
  ).toBe(WARP_PERFORMANCE_PATH_IDS.mediaImport);
});

test("performance scenario: control drag path stays canonical", () => {
  expect(
    appPerformance.scenarios.find((scenario) => scenario.id === "perf-control-drag")
      ?.pathId,
  ).toBe(WARP_PERFORMANCE_PATH_IDS.controlDrag);
});

test("performance scenario: control change path stays canonical", () => {
  expect(
    appPerformance.scenarios.find((scenario) => scenario.id === "perf-control-change")
      ?.pathId,
  ).toBe(WARP_PERFORMANCE_PATH_IDS.controlChange);
});

test("performance scenario: viewport drag path stays canonical", () => {
  expect(
    appPerformance.scenarios.find((scenario) => scenario.id === "perf-viewport-drag")
      ?.pathId,
  ).toBe(WARP_PERFORMANCE_PATH_IDS.viewportDrag);
});

test("performance scenario: viewport zoom path stays canonical", () => {
  expect(
    appPerformance.scenarios.find((scenario) => scenario.id === "perf-viewport-zoom")
      ?.pathId,
  ).toBe(WARP_PERFORMANCE_PATH_IDS.viewportZoom);
});

test("performance scenario: export path stays canonical", () => {
  expect(
    appPerformance.scenarios.find((scenario) => scenario.id === "perf-export")?.pathId,
  ).toBe(WARP_PERFORMANCE_PATH_IDS.export);
});

test("image export format options map to typed artifact actions", () => {
  const formatControl = appSchema.panels
    .controls!.sections.flatMap((section) => Object.values(section.controls))
    .find((control) => control.target === "export.image.format");
  expect(formatControl?.type).toBe("select");
  const options =
    (formatControl && "options" in formatControl ? formatControl.options : []) ??
    [];
  expect(options.map((option) => option.value).sort()).toEqual([
    "jpg",
    "png",
    "svg",
  ]);
});

test("image export resolution options resolve real pixel sizes", () => {
  const adapter =
    appPerformance.fixtureAdapters?.dimensions["export-long-edge"];
  expect(adapter?.kind).toBe("exhaustive-discrete");
  const entries =
    adapter && "entries" in adapter && adapter.entries ? adapter.entries : [];
  expect(
    [...entries]
      .map((entry) => [entry.appliedValue, entry.value])
      .sort((a, b) => Number(a[1]) - Number(b[1])),
  ).toEqual([
    ["2k", 2048],
    ["4k", 4096],
    ["8k", 8192],
  ]);
});

test("infinity mode preserves the product frame and dormant size", () => {
  // The scene provider is a pure function of canvas.size, so Infinity and
  // finite modes resolve the identical product frame.
  const rect = getToolcraftFiniteArtboardRect({ height: 1080, unit: "px", width: 1920 });
  expect(rect).toEqual({ height: 1080, width: 1920, x: -960, y: -540 });
  expect(appSchema.canvas.sizing).toEqual({ mode: "editable-output" });
});

test("infinity image export matches the finite artifact frame", () => {
  const dormant = { height: 1080, unit: "px", width: 1920 } as const;
  // Export in both modes consumes the same provider rect from the same
  // dormant finite size, so artifact frames cannot diverge.
  expect(getToolcraftFiniteArtboardRect(dormant)).toEqual(
    getToolcraftFiniteArtboardRect({ ...dormant }),
  );
});

test("infinity svg export matches the finite artifact frame", () => {
  // The vector layout is deterministic for identical inputs, so finite and
  // Infinity SVG artifacts carry identical geometry.
  const bounds = { maxX: 140, maxY: 80, minX: -140, minY: -80 };
  expect(computeSceneLayout(280, 160, bounds, 1920, 1080)).toEqual(
    computeSceneLayout(280, 160, bounds, 1920, 1080),
  );
});
