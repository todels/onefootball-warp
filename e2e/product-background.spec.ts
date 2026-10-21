// Registered browser acceptance for background semantics (background domain).

import type { Download, Page } from "@playwright/test";
import { expect, test } from "./toolcraft-product-test";

import {
  expectToolcraftBackgroundOutputSemantics,
  expectToolcraftFiniteBackgroundMediaStacking,
} from "./browser-background-output-evidence";
import {
  expectToolcraftInfinityCanvasBackgroundEvidence,
} from "./browser-infinity-canvas-evidence";
import { observeInfinityCanvasBackground } from "./browser-infinity-canvas-observation";
import { inspectToolcraftImageDownload } from "./image-artifact-inspection";
import { createToolcraftBrowserProofSession } from "./browser-proof-session";
import { expectToolcraftProductObservableToChange } from "./product-observable-helpers";
import {
  exportStillDownload,
  selectOptionByTarget,
  svgFixtureFile,
  uploadSource,
  openWarpApp,
} from "./product-warp-support";

async function toggleBackground(page: Page): Promise<void> {
  await page.getByRole("switch", { name: "Background", exact: true }).click();
}

function exportDownload(page: Page, buttonName: RegExp | string): Promise<Download> {
  return exportStillDownload(page, buttonName);
}

async function selectImageResolution(page: Page, label: string): Promise<void> {
  await selectOptionByTarget(page, "export.image.resolution", label);
}

const BACKGROUND_LAYER_SELECTOR = "[data-toolcraft-finite-background-layer]";

const backgroundPreviewObservation = (root: HTMLElement) => {
  const layer = root.querySelector<HTMLElement>(
    "[data-toolcraft-finite-background-layer]",
  );
  const visible = layer !== null;
  const color = layer ? getComputedStyle(layer).backgroundColor : "none";
  return {
    backgroundVisible: visible,
    outputSignature: visible ? `background:${color}` : "background:absent",
  };
};

const stackingObservation = (root: HTMLElement) => {
  const order: string[] = [];
  const walk = (element: Element) => {
    if (element.matches("[data-toolcraft-finite-background-layer]")) {
      order.push("background");
    }
    if (element.matches("[data-toolcraft-product-scene]")) order.push("product");
    for (const child of Array.from(element.children)) walk(child);
  };
  walk(root);
  const layer = root.querySelector<HTMLElement>(
    "[data-toolcraft-finite-background-layer]",
  );
  const mode = root
    .querySelector("[data-toolcraft-canvas-mode]")
    ?.getAttribute("data-toolcraft-canvas-mode");
  const productCanvas = root.querySelector<HTMLCanvasElement>(
    "canvas[data-toolcraft-product-output]",
  );
  let foregroundTransparent = false;
  if (productCanvas && productCanvas.width > 0) {
    const context = productCanvas.getContext("2d");
    const corner = context?.getImageData(0, 0, 4, 4).data;
    foregroundTransparent = corner ? corner[3] === 0 : false;
  }
  return {
    backgroundColor: layer ? getComputedStyle(layer).backgroundColor : "",
    backgroundVisible: layer !== null,
    canvasMode: (mode === "infinite" ? "infinite" : "finite") as
      | "finite"
      | "infinite",
    layerOrder: order,
    mediaVisible: false,
    outputSignature: `${layer !== null}:${order.join(">")}`,
    productForegroundTransparent: foregroundTransparent,
  };
};

test("browser: background switch controls preview fill and PNG transparency", async ({
  page,
}) => {
  await openWarpApp(page);
  const session = await createToolcraftBrowserProofSession(page);
  await uploadSource(page, svgFixtureFile());
  await selectImageResolution(page, "2K");

  // Preview exclusion + transparent PNG (background-preview-exclusion,
  // background-image-transparency, product-observable-change).
  await expectToolcraftBackgroundOutputSemantics(
    session.observe(backgroundPreviewObservation),
    session.controlAction("export.includeBackground", async (_, currentPage) => {
      await toggleBackground(currentPage);
    }),
    { backgroundVisible: false, outputSignature: "background:absent" },
    session.controlAction("export.includeBackground", (_, currentPage) =>
      exportDownload(currentPage, /Export PNG/),
    ),
    async (download) => {
      const inspected = await inspectToolcraftImageDownload({
        backgroundRgba: [0, 0, 0, 255],
        download,
        page,
      });
      const corner = inspected.observation.normalizedPixels;
      return {
        ...inspected.inspection,
        backgroundAlpha: corner[3] ?? 0,
      };
    },
    { requirementId: "background.include" },
  );

  // Finite media stacking: background re-enabled below the transparent
  // product foreground; the processing source stays out of the media layers.
  await expectToolcraftFiniteBackgroundMediaStacking(
    session.observe(stackingObservation),
    session.controlAction("export.includeBackground", async (_, currentPage) => {
      await toggleBackground(currentPage);
    }),
    {
      backgroundColor: "rgb(0, 0, 0)",
      backgroundVisible: true,
      canvasMode: "finite",
      layerOrder: ["background", "product"],
      mediaVisible: false,
      outputSignature: "true:background>product",
      productForegroundTransparent: true,
    },
    { requirementId: "background.include" },
  );

  // Infinity viewport fill and its independence from Background.
  await page.getByRole("switch", { name: "Infinity canvas" }).click();
  const infinite = await observeInfinityCanvasBackground(page);
  await toggleBackground(page);
  const backgroundExcluded = await observeInfinityCanvasBackground(page);
  await toggleBackground(page);
  const backgroundRestored = await observeInfinityCanvasBackground(page);
  await expectToolcraftInfinityCanvasBackgroundEvidence(
    { backgroundExcluded, backgroundRestored, infinite },
    {
      expectedBackgroundColor: infinite.runtimeBackgroundColor ?? "#FFFFFF",
      requirementId: "background.include",
      target: "export.includeBackground",
    },
  );
  await page.getByRole("switch", { name: "Infinity canvas" }).click();
});

test("browser: background color changes the fill behind the artwork", async ({
  page,
}) => {
  await openWarpApp(page);
  const session = await createToolcraftBrowserProofSession(page);
  await uploadSource(page, svgFixtureFile());

  await expectToolcraftProductObservableToChange(
    session,
    session.controlAction("appearance.background", async (control) => {
      const input = control.locator('input[type="text"]');
      await input.fill("#00E673");
      await input.press("Enter");
    }),
    {
      requirementId: "background.color",
      selector: BACKGROUND_LAYER_SELECTOR,
    },
  );
});

