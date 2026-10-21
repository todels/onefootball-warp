// Registered browser acceptance for workspace persistence (persistence domain).

import { expect, test } from "./toolcraft-product-test";

import { createToolcraftBrowserProofSession } from "./browser-proof-session";
import { expectToolcraftPersistenceState } from "./browser-state-evidence-helpers";
import { getToolcraftControlFieldByTarget } from "./browser-control-target-helpers";
import {
  productCanvasHasInk,
  svgFixtureFile,
  uploadSource,
  openWarpApp,
} from "./product-warp-support";

test("browser: the warped workspace survives a browser reload", async ({ page }) => {
  await openWarpApp(page);
  const session = await createToolcraftBrowserProofSession(page);

  const observation = session.observe((root) => {
    const widthInput = root.querySelector<HTMLInputElement>(
      '[data-toolcraft-control-target="canvas.size.width"] input',
    );
    const horizontal = root.querySelector<HTMLInputElement>(
      '[data-toolcraft-control-target="warp.horizontal"] input',
    );
    const files = Array.from(
      root.querySelectorAll('[data-slot="file-upload-file-item"]'),
    ).map((item) => item.textContent?.trim().replace(/\s+/g, " ") ?? "");
    return {
      canvasWidth: widthInput?.value ?? null,
      files: files.filter(Boolean),
      horizontal: horizontal?.value ?? null,
    };
  });

  await expectToolcraftPersistenceState(
    observation,
    session.targetAction("canvas.size.width", async (currentPage) => {
      await uploadSource(currentPage, svgFixtureFile());
      const horizontalField = await getToolcraftControlFieldByTarget(
        currentPage,
        "warp.horizontal",
      );
      const sliderInput = horizontalField.locator(
        '[data-slot="slider-thumb"] input',
      );
      await sliderInput.scrollIntoViewIfNeeded();
      await sliderInput.press("ArrowRight");
      await sliderInput.press("ArrowRight");
      const widthField = await getToolcraftControlFieldByTarget(
        currentPage,
        "canvas.size.width",
      );
      const widthInput = widthField.locator("input");
      await widthInput.fill("1600");
      await widthInput.press("Enter");
      // Let the debounced workspace save settle before the reload.
      await currentPage.waitForTimeout(1_800);
    }),
    session.reload(),
    { canvasWidth: "1600", files: ["of-badge.svg"], horizontal: "2" },
    {
      assertRestoredOutput: async () => {
        await expect
          .poll(() => productCanvasHasInk(page), { timeout: 15_000 })
          .toBe(true);
      },
      requirementId: "persistence.reload",
    },
  );
});
