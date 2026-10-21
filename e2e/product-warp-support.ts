// Shared product-spec plumbing: fixtures, upload, slider drags, canvas
// signatures. Evidence is emitted only by the protected helpers.

import { expect, type Page } from "@playwright/test";

import {
  getToolcraftApplicabilityRequirementId,
  getToolcraftControlApplicabilityCases,
} from "../src/app/app-acceptance";
import { appControlSectionInventory } from "../src/app/app-acceptance-data";
import { appSchema } from "../src/app/app-schema";
import { expectToolcraftControlApplicabilityState } from "./browser-control-applicability-evidence";
import { getToolcraftControlFieldByTarget } from "./browser-control-target-helpers";
import { expectToolcraftProductObservableToChange } from "./product-observable-helpers";
import type { ToolcraftBrowserProofSession } from "./browser-proof-session";

export const PRODUCT_CANVAS_SELECTOR = "canvas[data-toolcraft-product-output]";

/** Loads the app and waits for the runtime shell to mount (cold Vite
 * transforms plus ambient load can push the first paint past the proof
 * session's own 5s mount check). */
export async function openWarpApp(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator('[data-slot="toolcraft-runtime-app"]')).toBeVisible({
    timeout: 30_000,
  });
  await expect(
    page.locator('[data-toolcraft-control-target="source.file"]'),
  ).toBeVisible({ timeout: 30_000 });
}

export const TEST_BADGE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="180" viewBox="0 0 300 180"><rect x="10" y="10" width="280" height="160" rx="18" fill="#FF3355"/><circle cx="80" cy="90" r="40" fill="#00E673"/><path d="M140 60h120v12h-120zM140 90h100v12h-100zM140 120h80v12h-80z" fill="#FFFFFF"/></svg>`;

export async function uploadSource(
  page: Page,
  file: Readonly<{ buffer: Buffer; mimeType: string; name: string }>,
): Promise<void> {
  const field = await getToolcraftControlFieldByTarget(page, "source.file");
  const input = field.locator('input[type="file"]');
  await input.setInputFiles({
    buffer: file.buffer,
    mimeType: file.mimeType,
    name: file.name,
  });
  await expect(page.locator(PRODUCT_CANVAS_SELECTOR)).toBeVisible();
  await expect
    .poll(() => productCanvasHasInk(page), { timeout: 15_000 })
    .toBe(true);
}

export function svgFixtureFile(
  name = "of-badge.svg",
): Readonly<{ buffer: Buffer; mimeType: string; name: string }> {
  return {
    buffer: Buffer.from(TEST_BADGE_SVG, "utf8"),
    mimeType: "image/svg+xml",
    name,
  };
}

export async function productCanvasHasInk(page: Page): Promise<boolean> {
  return page.evaluate((selector) => {
    const canvas = document.querySelector<HTMLCanvasElement>(selector);
    if (!canvas || canvas.width === 0 || canvas.height === 0) return false;
    // Downsample before reading: full-backing getImageData is far too slow.
    const probe = document.createElement("canvas");
    probe.width = 64;
    probe.height = 64;
    const context = probe.getContext("2d", { willReadFrequently: true });
    if (!context) return false;
    context.drawImage(canvas, 0, 0, 64, 64);
    const sample = context.getImageData(0, 0, 64, 64).data;
    for (let index = 3; index < sample.length; index += 4) {
      if (sample[index]! > 16) return true;
    }
    return false;
  }, PRODUCT_CANVAS_SELECTOR);
}

export async function productCanvasSignature(page: Page): Promise<string> {
  return page.evaluate((selector) => {
    const canvas = document.querySelector<HTMLCanvasElement>(selector);
    if (!canvas || canvas.width === 0) return "no-canvas";
    const probe = document.createElement("canvas");
    probe.width = 96;
    probe.height = 96;
    const context = probe.getContext("2d", { willReadFrequently: true });
    if (!context) return "no-context";
    context.drawImage(canvas, 0, 0, 96, 96);
    const data = context.getImageData(0, 0, 96, 96).data;
    let hash = 7;
    let ink = 0;
    for (let index = 0; index < data.length; index += 1) {
      hash = (hash * 33 + data[index]!) >>> 0;
      if (index % 4 === 3 && data[index]! > 16) ink += 1;
    }
    return ink > 0 ? `warped:${hash.toString(16)}` : "empty-canvas";
  }, PRODUCT_CANVAS_SELECTOR);
}

export async function selectEffectTab(page: Page, label: string): Promise<void> {
  await page.getByRole("tab", { name: label }).click();
}

const EFFECT_LABELS: Record<string, string> = {
  arc: "Arc",
  perspective: "Perspective",
  sphere: "Sphere",
};

export function effectLabelFor(value: unknown): string {
  return EFFECT_LABELS[String(value)] ?? String(value);
}

/**
 * Drags the real slider thumb in steps and asserts the product canvas updates
 * BEFORE pointer release (live-slider acceptance), then releases.
 */
export async function dragSliderLive(
  page: Page,
  target: string,
  endFraction: number,
): Promise<void> {
  const field = await getToolcraftControlFieldByTarget(page, target);
  const slider = field.locator('[data-slot="slider"]');
  await slider.scrollIntoViewIfNeeded();
  const box = await slider.boundingBox();
  expect(box, `Slider "${target}" must be visible.`).toBeTruthy();
  if (!box) return;
  const y = box.y + box.height / 2;
  const startX = box.x + box.width / 2;
  const endX = box.x + box.width * Math.min(1, Math.max(0, endFraction));
  const midDragBaseline = await productCanvasSignature(page);
  await page.mouse.move(startX, y);
  await page.mouse.down();
  await page.mouse.move((startX + endX) / 2, y, { steps: 4 });
  await expect
    .poll(async () => productCanvasSignature(page), {
      message: `Canvas should update during the "${target}" drag, before release.`,
      timeout: 15_000,
    })
    .not.toBe(midDragBaseline);
  await page.mouse.move(endX, y, { steps: 4 });
  await page.mouse.up();
}

/** The case-suffixed requirement id of a control's visible applicability case. */
export function visibleCaseRequirementId(rowId: string, target: string): string {
  const cases = getToolcraftControlApplicabilityCases({
    schema: appSchema,
    sectionInventory: appControlSectionInventory,
    target,
  });
  const visibleCase = cases.find((candidate) => candidate.expectation === "visible");
  if (!visibleCase) throw new Error(`No visible case for ${target}.`);
  return getToolcraftApplicabilityRequirementId(rowId, visibleCase);
}

/** Runs every derived applicability case for a control and then proves the
 * live product change in its visible branch, emitting the case-suffixed
 * requirement ids the reporter derives for the row. */
export async function proveEffectDependentControl(
  session: ToolcraftBrowserProofSession,
  page: Page,
  options: Readonly<{
    rowId: string;
    target: string;
    /** Runs while the control's branch is visible; must change the canvas. */
    liveAction: () => Promise<void>;
    /** Prepares the visible branch before the live action (e.g. base values). */
    prepareVisible?: () => Promise<void>;
  }>,
): Promise<void> {
  const cases = getToolcraftControlApplicabilityCases({
    schema: appSchema,
    sectionInventory: appControlSectionInventory,
    target: options.target,
  });
  expect(cases.length, `Cases for ${options.target}`).toBeGreaterThan(0);
  const visibleCase = cases.find((candidate) => candidate.expectation === "visible");
  expect(visibleCase, `Visible case for ${options.target}`).toBeTruthy();

  for (const applicabilityCase of cases) {
    const branchLabel = effectLabelFor(applicabilityCase.selectorValue);
    await expectToolcraftControlApplicabilityState(
      session,
      session.controlAction(applicabilityCase.selectorTarget, async () => {
        await selectEffectTab(page, branchLabel);
      }),
      applicabilityCase,
      { baseRequirementId: options.rowId },
    );
  }

  if (!visibleCase) return;
  await selectEffectTab(page, effectLabelFor(visibleCase.selectorValue));
  await options.prepareVisible?.();
  await expectToolcraftProductObservableToChange(
    session,
    session.controlAction(options.target, async () => {
      await options.liveAction();
    }),
    {
      requirementId: getToolcraftApplicabilityRequirementId(
        options.rowId,
        visibleCase,
      ),
      selector: PRODUCT_CANVAS_SELECTOR,
    },
  );
}

/** Opens a Toolcraft select by its schema target and picks an option. */
export async function selectOptionByTarget(
  page: Page,
  target: string,
  optionLabel: string,
): Promise<void> {
  const field = await getToolcraftControlFieldByTarget(page, target);
  const trigger = field.locator('[data-slot="select-trigger"]');
  await trigger.scrollIntoViewIfNeeded();
  await trigger.click();
  await page.getByRole("option", { name: optionLabel, exact: true }).click();
}

/** Starts a still export and resolves the resulting download. */
export async function exportStillDownload(
  page: Page,
  buttonName: RegExp | string,
): Promise<import("@playwright/test").Download> {
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: buttonName }).click();
  return downloadPromise;
}

export async function toggleInfinityCanvas(page: Page): Promise<void> {
  await page.getByRole("switch", { name: "Infinity canvas" }).click();
}
