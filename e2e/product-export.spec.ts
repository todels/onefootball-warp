// Registered browser acceptance for still artifacts (export domain).

import type { Download, Page } from "@playwright/test";
import { expect, test } from "./toolcraft-product-test";

import {
  expectToolcraftAcceptanceOutcome,
  expectToolcraftExportedArtifact,
  expectToolcraftReferenceParity,
} from "./browser-acceptance-outcome-helpers";
import {
  getToolcraftApplicabilityRequirementId,
  getToolcraftControlApplicabilityCases,
} from "../src/app/app-acceptance";
import { appControlSectionInventory } from "../src/app/app-acceptance-data";
import { appSchema } from "../src/app/app-schema";
import { expectToolcraftControlApplicabilityState } from "./browser-control-applicability-evidence";
import { expectToolcraftImageExportArtifact } from "./browser-media-export-evidence";
import { expectToolcraftSvgExportArtifact } from "./browser-svg-export-evidence";
import {
  expectToolcraftInfinityCanvasImageExportEvidence,
} from "./browser-infinity-canvas-evidence";
import { expectToolcraftInfinityCanvasSvgExportEvidence } from "./browser-infinity-canvas-svg-evidence";
import { inspectToolcraftImageDownload } from "./image-artifact-inspection";
import { inspectToolcraftSvgDownload } from "./svg-artifact-inspection";
import { createToolcraftBrowserProofSession } from "./browser-proof-session";
import {
  exportStillDownload,
  selectOptionByTarget,
  svgFixtureFile,
  toggleInfinityCanvas,
  uploadSource,
  openWarpApp,
} from "./product-warp-support";

function exportDownload(page: Page, buttonName: RegExp | string): Promise<Download> {
  return exportStillDownload(page, buttonName);
}

async function selectImageFormat(page: Page, label: string): Promise<void> {
  await selectOptionByTarget(page, "export.image.format", label);
}

async function selectImageResolution(page: Page, label: string): Promise<void> {
  await selectOptionByTarget(page, "export.image.resolution", label);
}

test("browser: still export delivers PNG and JPG with the warped artwork", async ({
  page,
}) => {
  await openWarpApp(page);
  const session = await createToolcraftBrowserProofSession(page);
  await uploadSource(page, svgFixtureFile());
  await selectImageResolution(page, "2K");

  // Expected geometry at the identity warp: the measured artwork ink
  // (the 280x160 card) fitted by the fixed preview window into the 16:9
  // frame (scale = min(1920/361.088, 1080/206.336) = 5.23419...).
  const expectedBounds = { height: 0.7754, width: 0.7633, x: 0.1183, y: 0.1123 };
  const expectedPixels = [
    { rgba: [0, 230, 115, 255] as const, xRatio: 0.3092, yRatio: 0.5 },
    { rgba: [255, 51, 85, 255] as const, xRatio: 0.8271, yRatio: 0.7908 },
  ];

  await expectToolcraftImageExportArtifact(
    session.targetAction("actions.output", (currentPage) =>
      exportDownload(currentPage, /Export PNG/),
    ),
    {
      backgroundRgba: [0, 0, 0, 255],
      expectedBounds,
      expectedHeight: 1152,
      expectedMediaType: "image/png",
      expectedPixels,
      expectedWidth: 2048,
      page,
      requirementId: "export.image",
    },
  );

  // JPG coverage with the same geometry (lossy tolerance applies).
  await selectImageFormat(page, "JPG");
  const jpgDownload = await exportDownload(page, /Export JPG/);
  const jpg = await inspectToolcraftImageDownload({
    backgroundRgba: [0, 0, 0, 255],
    download: jpgDownload,
    page,
  });
  expect(jpg.inspection.mediaType).toBe("image/jpeg");
  expect(jpg.inspection.width).toBe(2048);
  expect(jpg.inspection.height).toBe(1152);

  // Resolution options stay selectable and labelled.
  await selectImageFormat(page, "PNG");
  await selectImageResolution(page, "4K");
  await selectImageResolution(page, "2K");

  // Reference parity (export/copy): like the plugin, the delivered artwork
  // keeps the source's warped footprint rather than filling the frame.
  await expectToolcraftReferenceParity(
    async () => {
      const download = await exportDownload(page, /Export PNG/);
      const inspected = await inspectToolcraftImageDownload({
        backgroundRgba: [0, 0, 0, 255],
        download,
        page,
      });
      const bounds = inspected.inspection.nonBackgroundBounds;
      return {
        containsArtwork: bounds !== null,
        insideFrame:
          bounds !== null &&
          bounds.x > 0.05 &&
          bounds.y > 0.05 &&
          bounds.x + bounds.width < 0.95 &&
          bounds.y + bounds.height < 0.95,
      };
    },
    { containsArtwork: true, insideFrame: true },
    { requirementId: "export.image", target: "actions.output" },
  );
});

test("browser: svg export downloads self-contained editable warped vectors", async ({
  page,
}) => {
  await openWarpApp(page);
  const session = await createToolcraftBrowserProofSession(page);
  await uploadSource(page, svgFixtureFile());
  await selectImageFormat(page, "SVG");

  const inspected = await expectToolcraftSvgExportArtifact(
    session.targetAction("actions.output", (currentPage) =>
      exportDownload(currentPage, /Export SVG/),
    ),
    {
      expectedBackgroundColor: "#000000",
      expectedElements: [
        { attributes: { fill: "#00E673" }, selector: 'path[fill="#00E673"]' },
        { attributes: { fill: "#FF3355" }, selector: 'path[fill="#FF3355"]' },
      ],
      expectedHeight: 1080,
      expectedWidth: 1920,
      page,
      requirementId: "export.svg",
    },
  );

  // Reference parity (export/copy): like the plugin's SVG output, the
  // artifact is editable vectors only, carrying the warped geometry group.
  await expectToolcraftReferenceParity(
    async () => ({
      vectorOnly:
        !inspected.source.includes("<image") &&
        !inspected.source.includes("<foreignObject"),
      warpGroupPresent: inspected.source.includes("data-onefootball-warp"),
    }),
    { vectorOnly: true, warpGroupPresent: true },
    { requirementId: "export.svg", target: "actions.output" },
  );

  // Returning to a raster format restores the retained resolution control.
  await selectImageFormat(page, "PNG");
  await expect(
    page.locator('[data-toolcraft-control-target="export.image.resolution"]'),
  ).toBeVisible();
});

test("browser: image format selection switches the still export action", async ({
  page,
}) => {
  await openWarpApp(page);
  const session = await createToolcraftBrowserProofSession(page);
  await uploadSource(page, svgFixtureFile());

  const stillButtonLabel = () =>
    page
      .getByRole("button", { name: /Export (PNG|JPG|SVG)/ })
      .textContent()
      .then((text) => (text ?? "").trim());

  await expectToolcraftAcceptanceOutcome(
    stillButtonLabel,
    session.controlAction("export.image.format", async (_, currentPage) => {
      await selectImageFormat(currentPage, "JPG");
    }),
    { evidenceType: "command-side-effect", requirementId: "export.image.format" },
  );
  await expect(page.getByRole("button", { name: /Export JPG/ })).toBeVisible();
  await selectImageFormat(page, "SVG");
  await expect(page.getByRole("button", { name: /Export SVG/ })).toBeVisible();
  await selectImageFormat(page, "PNG");
  await expect(page.getByRole("button", { name: /Export PNG/ })).toBeVisible();
});

test("browser: image resolution selection commits and hides during svg", async ({
  page,
}) => {
  await openWarpApp(page);
  const session = await createToolcraftBrowserProofSession(page);
  await uploadSource(page, svgFixtureFile());

  const cases = getToolcraftControlApplicabilityCases({
    schema: appSchema,
    sectionInventory: appControlSectionInventory,
    target: "export.image.resolution",
  });
  expect(cases.length).toBeGreaterThan(0);

  const formatLabelFor = (value: unknown): string => String(value).toUpperCase();

  for (const applicabilityCase of cases) {
    await expectToolcraftControlApplicabilityState(
      session,
      session.controlAction(
        applicabilityCase.selectorTarget,
        async (_, currentPage) => {
          await selectImageFormat(
            currentPage,
            formatLabelFor(applicabilityCase.selectorValue),
          );
        },
      ),
      applicabilityCase,
      { baseRequirementId: "export.image.resolution" },
    );
    if (applicabilityCase.expectation !== "visible") continue;
    // The visible branch commits a resolution change as a command effect.
    const selectedResolution = () =>
      page
        .locator(
          '[data-toolcraft-control-target="export.image.resolution"] [data-slot="select-value"]',
        )
        .textContent()
        .then((text) => (text ?? "").trim());
    await expectToolcraftAcceptanceOutcome(
      selectedResolution,
      session.controlAction("export.image.resolution", async (_, currentPage) => {
        const current = await selectedResolution();
        await selectImageResolution(currentPage, current === "2K" ? "8K" : "2K");
      }),
      {
        evidenceType: "command-side-effect",
        requirementId: getToolcraftApplicabilityRequirementId(
          "export.image.resolution",
          applicabilityCase,
        ),
      },
    );
    // Exercise the remaining option so every item is covered.
    await selectImageResolution(page, "4K");
    await selectImageResolution(page, "2K");
  }
});

test("browser: infinity png export matches the finite artifact", async ({ page }) => {
  await openWarpApp(page);
  await createToolcraftBrowserProofSession(page);
  await uploadSource(page, svgFixtureFile());
  await selectOptionByTarget(page, "export.image.resolution", "2K");

  const finiteDownload = await exportDownload(page, /Export PNG/);
  const finite = await inspectToolcraftImageDownload({
    backgroundRgba: [0, 0, 0, 255],
    download: finiteDownload,
    page,
  });

  await toggleInfinityCanvas(page);
  const infiniteDownload = await exportDownload(page, /Export PNG/);
  const infinite = await inspectToolcraftImageDownload({
    backgroundRgba: [0, 0, 0, 255],
    download: infiniteDownload,
    page,
  });
  await toggleInfinityCanvas(page);

  await expectToolcraftInfinityCanvasImageExportEvidence(
    {
      finite: {
        byteLength: finite.inspection.byteLength,
        decodedPixelHash: finite.inspection.decodedPixelHash,
        height: finite.inspection.height,
        width: finite.inspection.width,
      },
      infinite: {
        byteLength: infinite.inspection.byteLength,
        decodedPixelHash: infinite.inspection.decodedPixelHash,
        height: infinite.inspection.height,
        width: infinite.inspection.width,
      },
    },
    {
      expectedSize: { height: 1152, width: 2048 },
      requirementId: "export.image.infinity",
      target: "canvas.infinity",
    },
  );
});

test("browser: infinity svg export matches the finite artifact", async ({ page }) => {
  await openWarpApp(page);
  const session = await createToolcraftBrowserProofSession(page);
  await uploadSource(page, svgFixtureFile());
  await selectImageFormat(page, "SVG");

  const finiteDownload = await exportDownload(page, /Export SVG/);
  const finite = await inspectToolcraftSvgDownload({
    download: finiteDownload,
    page,
  });

  await toggleInfinityCanvas(page);
  let infinite: Awaited<ReturnType<typeof inspectToolcraftSvgDownload>> | undefined;
  await expectToolcraftExportedArtifact(
    session.targetAction("canvas.infinity", (currentPage) =>
      exportDownload(currentPage, /Export SVG/),
    ),
    async (download) => {
      infinite = await inspectToolcraftSvgDownload({ download, page });
      return infinite.inspection;
    },
    { requirementId: "export.svg.infinity" },
  );
  const infiniteInspected = infinite as
    | Awaited<ReturnType<typeof inspectToolcraftSvgDownload>>
    | undefined;
  if (!infiniteInspected) throw new Error("Infinity SVG export was not inspected.");
  await toggleInfinityCanvas(page);

  await expectToolcraftInfinityCanvasSvgExportEvidence(
    { finite: finite.inspection, infinite: infiniteInspected.inspection },
    {
      expectedSize: { height: 1080, width: 1920 },
      requirementId: "export.svg.infinity",
      target: "canvas.infinity",
    },
  );
});
