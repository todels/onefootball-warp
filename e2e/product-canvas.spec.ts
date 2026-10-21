// Registered browser acceptance for canvas runtime behavior (canvas domain):
// resolution scale backing and Infinity mode continuity.

import type { Page } from "@playwright/test";
import { expect, test } from "./toolcraft-product-test";

import { expectToolcraftReferenceParity } from "./browser-acceptance-outcome-helpers";
import { expectToolcraftCanvasRenderScaleEvidence } from "./browser-render-scale-evidence";
import { expectToolcraftDiscreteSliderMarkers } from "./performance-control-layout-helpers";
import {
  expectToolcraftInfinityCanvasModeEvidence,
  type InfinityCanvasTransitionContinuity,
} from "./browser-infinity-canvas-evidence";
import { observeInfinityCanvas } from "./browser-infinity-canvas-observation";
import { createToolcraftBrowserProofSession } from "./browser-proof-session";
import {
  PRODUCT_CANVAS_SELECTOR,
  dragSliderLive,
  productCanvasHasInk,
  svgFixtureFile,
  toggleInfinityCanvas,
  uploadSource,
  openWarpApp,
} from "./product-warp-support";

const ARTBOARD_RECT = { height: 1080, width: 1920, x: -960, y: -540 };

async function markProductHost(page: Page): Promise<void> {
  await page.evaluate((selector) => {
    const canvas = document.querySelector<HTMLCanvasElement>(selector);
    (window as { __warpProbe?: Element | null }).__warpProbe = canvas;
    (window as { __warpProbeBacking?: string }).__warpProbeBacking = canvas
      ? `${canvas.width}x${canvas.height}`
      : "none";
  }, PRODUCT_CANVAS_SELECTOR);
}

async function readContinuity(
  page: Page,
): Promise<InfinityCanvasTransitionContinuity> {
  return page.evaluate((selector) => {
    const canvas = document.querySelector<HTMLCanvasElement>(selector);
    const probe = (window as { __warpProbe?: Element | null }).__warpProbe;
    const backing = (window as { __warpProbeBacking?: string }).__warpProbeBacking;
    let hasInk = false;
    if (canvas && canvas.width > 0) {
      const probe = document.createElement("canvas");
      probe.width = 64;
      probe.height = 64;
      const context = probe.getContext("2d", { willReadFrequently: true });
      if (context) {
        context.drawImage(canvas, 0, 0, 64, 64);
        const data = context.getImageData(0, 0, 64, 64).data;
        for (let index = 3; index < data.length; index += 4) {
          if (data[index]! > 16) {
            hasInk = true;
            break;
          }
        }
      }
    }
    return {
      productHostPreserved: canvas !== null && probe === canvas,
      productOutputPreserved:
        canvas !== null && backing === `${canvas.width}x${canvas.height}` && hasInk,
    };
  }, PRODUCT_CANVAS_SELECTOR);
}

async function panViewport(page: Page): Promise<void> {
  const viewport = page.getByRole("application", { name: "Canvas viewport" });
  const box = await viewport.boundingBox();
  if (!box) throw new Error("Canvas viewport must be visible.");
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  // Focus the canvas surface so Space is not swallowed by a panel control.
  await page.mouse.click(startX, startY);
  await page.keyboard.down("Space");
  await page.waitForTimeout(120);
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 180, startY + 80, { steps: 12 });
  await page.waitForTimeout(80);
  await page.mouse.up();
  await page.keyboard.up("Space");
  await page.waitForTimeout(120);
}

test("browser: resolution scale keeps css size and scales backing pixels", async ({
  page,
}) => {
  await openWarpApp(page);
  await createToolcraftBrowserProofSession(page);
  await uploadSource(page, svgFixtureFile());

  await expectToolcraftDiscreteSliderMarkers(
    page,
    "canvas.renderScale",
    "canvas.render-scale",
  );

  await expectToolcraftCanvasRenderScaleEvidence(page, {
    canvasSelector: PRODUCT_CANVAS_SELECTOR,
    requirementId: "canvas.render-scale",
    selectedScale: 2,
    stateTransitions: [
      {
        run: async () => {
          await dragSliderLive(page, "warp.horizontal", 0.8);
        },
        state: "interaction",
      },
      {
        run: async () => {
          await page.waitForTimeout(400);
        },
        state: "steady",
      },
    ],
    target: "canvas.renderScale",
  });
});

test("browser: infinity canvas preserves the warped scene and restores the finite artboard", async ({
  page,
}) => {
  await openWarpApp(page);
  await createToolcraftBrowserProofSession(page);
  await uploadSource(page, svgFixtureFile());

  const before = await observeInfinityCanvas(page);
  await markProductHost(page);
  await toggleInfinityCanvas(page);
  const enabled = await observeInfinityCanvas(page);
  const beforeToEnabled = await readContinuity(page);

  await panViewport(page);
  const afterPan = await observeInfinityCanvas(page);

  // Let persistence settle so the reload restores the infinite workspace.
  await page.waitForTimeout(1_800);
  await page.reload();
  await expect.poll(() => productCanvasHasInk(page), { timeout: 15_000 }).toBe(true);
  const afterReload = await observeInfinityCanvas(page);

  await markProductHost(page);
  await toggleInfinityCanvas(page);
  const restored = await observeInfinityCanvas(page);
  const afterReloadToRestored = await readContinuity(page);

  await markProductHost(page);
  await page.getByRole("button", { name: "Undo" }).click();
  const undone = await observeInfinityCanvas(page);
  const restoredToUndone = await readContinuity(page);

  await markProductHost(page);
  await page.getByRole("button", { name: "Redo" }).click();
  const redone = await observeInfinityCanvas(page);
  const undoneToRedone = await readContinuity(page);

  await expectToolcraftInfinityCanvasModeEvidence(
    { afterPan, afterReload, before, enabled, redone, restored, undone },
    { afterReloadToRestored, beforeToEnabled, restoredToUndone, undoneToRedone },
    {
      expectedFiniteSize: { height: 1080, width: 1920 },
      expectedSceneRect: ARTBOARD_RECT,
      requirementId: "canvas.infinity-mode",
      target: "canvas.infinity",
    },
  );

  // Reference parity (canvas sizing): the approved change from the plugin's
  // fixed preview window to the Toolcraft artboard keeps output canvas-only
  // in both modes and restores the exact dormant finite size.
  await expectToolcraftReferenceParity(
    async () => ({
      finiteSizeRestored:
        redone.finiteCanvasSize?.width === 1920 &&
        redone.finiteCanvasSize?.height === 1080,
      outputCanvasOnly: await productCanvasHasInk(page),
    }),
    { finiteSizeRestored: true, outputCanvasOnly: true },
    { requirementId: "canvas.infinity-mode", target: "canvas.infinity" },
  );
});

