// One browser adapter per canonical performance path. These execute only
// inside an authority-backed targeted iteration or an explicit full audit.

import { expect, type Page } from "@playwright/test";

import { WARP_PERFORMANCE_PATH_IDS } from "../src/app/app-performance";
import type {
  ToolcraftPerformanceCanvasBacking,
  ToolcraftPerformancePathAdapter,
} from "./performance-path-adapter-contract";
import { getToolcraftControlFieldByTarget } from "./browser-control-target-helpers";
import {
  PRODUCT_CANVAS_SELECTOR,
  productCanvasSignature,
  selectEffectTab,
  selectOptionByTarget,
  svgFixtureFile,
  uploadSource,
} from "./product-warp-support";

export const appPerformanceCanvasBacking:
  | ToolcraftPerformanceCanvasBacking
  | undefined = { canvasSelector: PRODUCT_CANVAS_SELECTOR };

/** Uploads a generated raster source of the given megapixel size through the
 * real file input, so the source-megapixels dimension is applied exactly. */
async function applySourceMegapixels(page: Page, value: unknown): Promise<void> {
  const megapixels = Number(value);
  expect(Number.isFinite(megapixels) && megapixels > 0).toBe(true);
  const side = Math.max(8, Math.round(Math.sqrt(megapixels * 1_000_000)));
  const dataUrl = await page.evaluate(async (edge) => {
    const canvas = document.createElement("canvas");
    canvas.width = edge;
    canvas.height = edge;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("fixture canvas context");
    const gradient = context.createLinearGradient(0, 0, edge, edge);
    gradient.addColorStop(0, "#111111");
    gradient.addColorStop(1, "#00E673");
    context.fillStyle = gradient;
    context.fillRect(0, 0, edge, edge);
    return canvas.toDataURL("image/png");
  }, side);
  const base64 = dataUrl.split(",")[1] ?? "";
  const field = await getToolcraftControlFieldByTarget(page, "source.file");
  await field.locator('input[type="file"]').setInputFiles({
    buffer: Buffer.from(base64, "base64"),
    mimeType: "image/png",
    name: `perf-${side}px.png`,
  });
  await expect
    .poll(() => observeSourceMegapixels(page), { timeout: 30_000 })
    .toBeCloseTo((side * side) / 1_000_000, 2);
}

async function observeSourceMegapixels(page: Page): Promise<number> {
  const value = await page
    .locator(PRODUCT_CANVAS_SELECTOR)
    .getAttribute("data-warp-source-megapixels");
  return value && value !== "vector" ? Number(value) : Number.NaN;
}

function sourceFixtureApplications(page: Page) {
  return {
    "source-megapixels": {
      applyValue: (value: unknown) => applySourceMegapixels(page, value),
      observeValue: () => observeSourceMegapixels(page),
    },
  };
}

async function selectResolutionOption(page: Page, value: unknown): Promise<void> {
  await selectOptionByTarget(
    page,
    "export.image.resolution",
    String(value).toUpperCase(),
  );
}

async function observeResolutionOption(page: Page): Promise<string> {
  const text = await page
    .locator(
      '[data-toolcraft-control-target="export.image.resolution"] [data-slot="select-value"]',
    )
    .textContent();
  return (text ?? "").trim().toLowerCase();
}

async function dragSlider(page: Page, target: string, fraction: number): Promise<void> {
  const field = await getToolcraftControlFieldByTarget(page, target);
  const slider = field.locator('[data-slot="slider"]');
  const box = await slider.boundingBox();
  if (!box) throw new Error(`Slider "${target}" must be visible.`);
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * fraction, y, { steps: 10 });
  await page.mouse.up();
}

const prepareWarpedSource = async (page: Page): Promise<void> => {
  await page.goto("/");
  await uploadSource(page, svgFixtureFile());
};

export const appPerformancePathAdapters = [
  {
    fixtureApplications: sourceFixtureApplications,
    observeOutcome: ({ page }) => productCanvasSignature(page),
    pathId: WARP_PERFORMANCE_PATH_IDS.initialRender,
    prepare: prepareWarpedSource,
    action: async ({ page }) => {
      await page.reload();
      await expect(page.locator(PRODUCT_CANVAS_SELECTOR)).toBeVisible();
    },
  },
  {
    fixtureApplications: sourceFixtureApplications,
    observeOutcome: ({ page }) => productCanvasSignature(page),
    pathId: WARP_PERFORMANCE_PATH_IDS.mediaImport,
    prepare: async (page) => {
      await page.goto("/");
    },
    action: async ({ page }) => {
      await uploadSource(page, svgFixtureFile("perf-import.svg"));
    },
  },
  {
    fixtureApplications: sourceFixtureApplications,
    observeOutcome: ({ page }) => productCanvasSignature(page),
    pathId: WARP_PERFORMANCE_PATH_IDS.controlDrag,
    prepare: prepareWarpedSource,
    action: async ({ page }) => {
      await dragSlider(page, "warp.horizontal", 0.85);
    },
  },
  {
    fixtureApplications: sourceFixtureApplications,
    observeOutcome: ({ page }) => productCanvasSignature(page),
    pathId: WARP_PERFORMANCE_PATH_IDS.controlChange,
    prepare: prepareWarpedSource,
    action: async ({ page }) => {
      await selectEffectTab(page, "Sphere");
      await dragSlider(page, "warp.amount", 0.9);
      await selectEffectTab(page, "Perspective");
    },
  },
  {
    fixtureApplications: sourceFixtureApplications,
    pathId: WARP_PERFORMANCE_PATH_IDS.viewportDrag,
    prepare: prepareWarpedSource,
    action: async ({ page }) => {
      const viewport = page.getByRole("application", { name: "Canvas viewport" });
      const box = await viewport.boundingBox();
      if (!box) throw new Error("Canvas viewport must be visible.");
      await page.keyboard.down("Space");
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 160, box.y + box.height / 2 + 90, {
        steps: 12,
      });
      await page.mouse.up();
      await page.keyboard.up("Space");
    },
  },
  {
    fixtureApplications: sourceFixtureApplications,
    pathId: WARP_PERFORMANCE_PATH_IDS.viewportZoom,
    prepare: prepareWarpedSource,
    action: async ({ page }) => {
      const viewport = page.getByRole("application", { name: "Canvas viewport" });
      const box = await viewport.boundingBox();
      if (!box) throw new Error("Canvas viewport must be visible.");
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.wheel(0, -400);
    },
  },
  {
    fixtureApplications: (page: Page) => ({
      ...sourceFixtureApplications(page),
      "export-long-edge": {
        applyValue: (value: unknown) => selectResolutionOption(page, value),
        observeValue: () => observeResolutionOption(page),
      },
    }),
    output: {
      kind: "download",
      label: "Export PNG",
      verify: async (download) => {
        const path = await download.path();
        if (!path) throw new Error("Export download must expose a file path.");
      },
    },
    pathId: WARP_PERFORMANCE_PATH_IDS.export,
    prepare: prepareWarpedSource,
  },
] as const satisfies readonly ToolcraftPerformancePathAdapter[];
