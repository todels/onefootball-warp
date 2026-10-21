// Registered browser acceptance for the Source uploader (source domain).

import { expect, test } from "./toolcraft-product-test";

import { createToolcraftBrowserProofSession } from "./browser-proof-session";
import { expectToolcraftMediaLifecycle } from "./browser-state-evidence-helpers";
import { expectToolcraftReferenceParity } from "./browser-acceptance-outcome-helpers";
import { getToolcraftControlFieldByTarget } from "./browser-control-target-helpers";
import {
  productCanvasHasInk,
  svgFixtureFile,
  uploadSource,
  openWarpApp,
} from "./product-warp-support";

const mediaObservationScript = (root: HTMLElement) => {
  const items = Array.from(
    root.querySelectorAll('[data-slot="file-upload-file-item"]'),
  ).map((item) => item.textContent?.trim().replace(/\s+/g, " ") ?? "");
  const canvas = root.querySelector<HTMLCanvasElement>(
    "canvas[data-toolcraft-product-output]",
  );
  // Content-sensitive but deterministic: the default logo is monochrome
  // while the badge fixture carries a green circle.
  let signature = "empty-canvas";
  if (canvas && canvas.width > 0) {
    const probe = document.createElement("canvas");
    probe.width = 64;
    probe.height = 64;
    const context = probe.getContext("2d", { willReadFrequently: true });
    if (context) {
      context.drawImage(canvas, 0, 0, 64, 64);
      const data = context.getImageData(0, 0, 64, 64).data;
      let hasInk = false;
      let hasGreen = false;
      for (let index = 0; index < data.length; index += 4) {
        const alpha = data[index + 3]!;
        if (alpha > 16) {
          hasInk = true;
          if (data[index + 1]! > 150 && data[index]! < 120) hasGreen = true;
        }
      }
      signature = hasGreen
        ? "warped-badge"
        : hasInk
          ? "warped-monochrome"
          : "empty-canvas";
    }
  }
  return { itemIds: items.filter(Boolean), outputSignature: signature };
};

test("browser: uploading, removing, and resetting the source drives the warped canvas", async ({
  page,
}) => {
  await openWarpApp(page);
  const session = await createToolcraftBrowserProofSession(page);

  // The default OneFootball logo renders as the initial source.
  await expect(page.locator('[data-slot="file-upload-file-item"]')).toContainText(
    "onefootball.svg",
  );
  await expect.poll(() => productCanvasHasInk(page), { timeout: 15_000 }).toBe(true);

  const observation = session.observe(mediaObservationScript);
  await expectToolcraftMediaLifecycle(
    observation,
    session.targetAction("source.file", async (currentPage) => {
      await uploadSource(currentPage, svgFixtureFile());
    }),
    { itemIds: ["of-badge.svg"], outputSignature: "warped-badge" },
    { requirementId: "source.upload" },
  );

  // Reference parity (media handling): like the plugin, both vector and
  // raster sources are accepted as warp input.
  await expectToolcraftReferenceParity(
    async () => {
      const field = await getToolcraftControlFieldByTarget(page, "source.file");
      const accept =
        (await field.locator('input[type="file"]').first().getAttribute("accept")) ??
        "";
      return {
        acceptsRaster: accept.includes(".png") && accept.includes(".jpg"),
        acceptsVector: accept.includes(".svg"),
      };
    },
    { acceptsRaster: true, acceptsVector: true },
    { requirementId: "source.upload", target: "source.file" },
  );

  // Remove clears the canvas (the uploaded badge replaced the default).
  const fileItem = page.locator('[data-slot="file-upload-file-item"]');
  await fileItem.scrollIntoViewIfNeeded();
  await fileItem.hover();
  await page.getByRole("button", { name: "Remove of-badge.svg" }).click();
  await expect.poll(() => productCanvasHasInk(page)).toBe(false);

  // Reset restores the default OneFootball logo source.
  await uploadSource(page, svgFixtureFile());
  await page.getByRole("button", { name: "Reset controls" }).click();
  await expect(page.locator('[data-slot="file-upload-file-item"]')).toContainText(
    "onefootball.svg",
    { timeout: 15_000 },
  );
  await expect.poll(() => productCanvasHasInk(page), { timeout: 15_000 }).toBe(true);
});

