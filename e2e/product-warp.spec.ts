// Registered browser acceptance for the Warp section.

import { expect, test } from "./toolcraft-product-test";

import { expectToolcraftReferenceParity } from "./browser-acceptance-outcome-helpers";
import { createToolcraftBrowserProofSession } from "./browser-proof-session";
import { expectToolcraftProductObservableToChange } from "./product-observable-helpers";
import {
  PRODUCT_CANVAS_SELECTOR,
  dragSliderLive,
  productCanvasHasInk,
  proveEffectDependentControl,
  selectEffectTab,
  selectOptionByTarget,
  svgFixtureFile,
  uploadSource,
  visibleCaseRequirementId,
  openWarpApp,
} from "./product-warp-support";

test("browser: effect tabs switch the projection and the visible parameter set", async ({
  page,
}) => {
  await openWarpApp(page);
  const session = await createToolcraftBrowserProofSession(page);
  await uploadSource(page, svgFixtureFile());
  // A non-identity perspective makes every tab change visible.
  await dragSliderLive(page, "warp.horizontal", 0.8);

  // Option coverage: every tab re-renders the product output.
  await expectToolcraftProductObservableToChange(
    session,
    session.controlAction("warp.effect", async (_, currentPage) => {
      await selectEffectTab(currentPage, "Sphere");
    }),
    { requirementId: "warp.effect", selector: PRODUCT_CANVAS_SELECTOR },
  );
  await selectEffectTab(page, "Arc");
  await expect(page.getByRole("tab", { name: "Arc" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await selectEffectTab(page, "Perspective");
  await expect(page.getByRole("tab", { name: "Perspective" })).toHaveAttribute(
    "aria-selected",
    "true",
  );

  // Reference parity (control mapping): the web variant exposes exactly the
  // plugin's three effect tabs in the same order.
  await expectToolcraftReferenceParity(
    async () =>
      page
        .getByRole("tablist")
        .first()
        .getByRole("tab")
        .allTextContents(),
    ["Perspective", "Sphere", "Arc"],
    { requirementId: "warp.effect", target: "warp.effect" },
  );
});

test("browser: dragging Horizontal re-projects the canvas live", async ({ page }) => {
  await openWarpApp(page);
  const session = await createToolcraftBrowserProofSession(page);
  await uploadSource(page, svgFixtureFile());
  await proveEffectDependentControl(session, page, {
    liveAction: () => dragSliderLive(page, "warp.horizontal", 0.85),
    rowId: "warp.horizontal",
    target: "warp.horizontal",
  });

  // Reference parity (renderer state): like the plugin's projector, a yawed
  // plane renders an asymmetric trapezoid — one side visibly taller.
  await expectToolcraftReferenceParity(
    async () =>
      page.evaluate(() => {
        const canvas = document.querySelector<HTMLCanvasElement>(
          "canvas[data-toolcraft-product-output]",
        );
        if (!canvas) return { asymmetric: false };
        const size = 256;
        const probe = document.createElement("canvas");
        probe.width = size;
        probe.height = size;
        const context = probe.getContext("2d", { willReadFrequently: true });
        if (!context) return { asymmetric: false };
        context.drawImage(canvas, 0, 0, size, size);
        const data = context.getImageData(0, 0, size, size).data;
        let inkMinX = size;
        let inkMaxX = -1;
        for (let y = 0; y < size; y += 1) {
          for (let x = 0; x < size; x += 1) {
            if (data[(y * size + x) * 4 + 3]! > 16) {
              if (x < inkMinX) inkMinX = x;
              if (x > inkMaxX) inkMaxX = x;
            }
          }
        }
        if (inkMaxX <= inkMinX) return { asymmetric: false };
        const columnHeight = (x: number): number => {
          let top = -1;
          let bottom = -1;
          for (let y = 0; y < size; y += 1) {
            if (data[(y * size + x) * 4 + 3]! > 16) {
              if (top < 0) top = y;
              bottom = y;
            }
          }
          return top < 0 ? 0 : bottom - top;
        };
        const span = inkMaxX - inkMinX;
        const left = columnHeight(inkMinX + Math.round(span * 0.15));
        const right = columnHeight(inkMinX + Math.round(span * 0.85));
        const larger = Math.max(left, right);
        return {
          asymmetric: larger > 0 && Math.abs(left - right) / larger > 0.05,
        };
      }),
    { asymmetric: true },
    {
      requirementId: visibleCaseRequirementId("warp.horizontal", "warp.horizontal"),
      target: "warp.horizontal",
    },
  );
});

test("browser: dragging Vertical re-projects the canvas live", async ({ page }) => {
  await openWarpApp(page);
  const session = await createToolcraftBrowserProofSession(page);
  await uploadSource(page, svgFixtureFile());
  await proveEffectDependentControl(session, page, {
    liveAction: () => dragSliderLive(page, "warp.vertical", 0.85),
    rowId: "warp.vertical",
    target: "warp.vertical",
  });
});

test("browser: dragging Depth changes the projection strength live", async ({
  page,
}) => {
  await openWarpApp(page);
  const session = await createToolcraftBrowserProofSession(page);
  await uploadSource(page, svgFixtureFile());
  await proveEffectDependentControl(session, page, {
    liveAction: () => dragSliderLive(page, "warp.depth", 0.9),
    prepareVisible: async () => {
      await dragSliderLive(page, "warp.horizontal", 0.8);
    },
    rowId: "warp.depth",
    target: "warp.depth",
  });
});

test("browser: dragging Amount bulges the canvas live", async ({ page }) => {
  await openWarpApp(page);
  const session = await createToolcraftBrowserProofSession(page);
  await uploadSource(page, svgFixtureFile());
  await proveEffectDependentControl(session, page, {
    liveAction: () => dragSliderLive(page, "warp.amount", 0.9),
    rowId: "warp.amount",
    target: "warp.amount",
  });
});

test("browser: dragging Radius rescales the bulge live", async ({ page }) => {
  await openWarpApp(page);
  const session = await createToolcraftBrowserProofSession(page);
  await uploadSource(page, svgFixtureFile());
  await proveEffectDependentControl(session, page, {
    liveAction: () => dragSliderLive(page, "warp.radius", 0.2),
    prepareVisible: async () => {
      await dragSliderLive(page, "warp.amount", 0.9);
    },
    rowId: "warp.radius",
    target: "warp.radius",
  });
});

test("browser: toggling Perfectly round changes the bulge shape", async ({
  page,
}) => {
  await openWarpApp(page);
  const session = await createToolcraftBrowserProofSession(page);
  await uploadSource(page, svgFixtureFile());
  await proveEffectDependentControl(session, page, {
    liveAction: async () => {
      await page.getByRole("switch", { name: "Perfectly round" }).click();
    },
    prepareVisible: async () => {
      await dragSliderLive(page, "warp.amount", 0.9);
    },
    rowId: "warp.round",
    target: "warp.round",
  });
});

test("browser: toggling Clip to sphere trims the output", async ({ page }) => {
  await openWarpApp(page);
  const session = await createToolcraftBrowserProofSession(page);
  await uploadSource(page, svgFixtureFile());
  await proveEffectDependentControl(session, page, {
    liveAction: async () => {
      await page.getByRole("switch", { name: "Clip to sphere" }).click();
    },
    prepareVisible: async () => {
      await dragSliderLive(page, "warp.amount", 0.9);
    },
    rowId: "warp.clip",
    target: "warp.clip",
  });
});

test("browser: dragging Bend arcs the canvas live", async ({ page }) => {
  await openWarpApp(page);
  const session = await createToolcraftBrowserProofSession(page);
  await uploadSource(page, svgFixtureFile());
  await proveEffectDependentControl(session, page, {
    liveAction: () => dragSliderLive(page, "warp.bend", 0.9),
    rowId: "warp.bend",
    target: "warp.bend",
  });
});

test("browser: switching Direction re-arcs the canvas on the other axis", async ({
  page,
}) => {
  await openWarpApp(page);
  const session = await createToolcraftBrowserProofSession(page);
  await uploadSource(page, svgFixtureFile());
  await proveEffectDependentControl(session, page, {
    liveAction: async () => {
      // Option coverage: both Direction options drive distinct output.
      await selectOptionByTarget(page, "warp.direction", "Vertical");
    },
    prepareVisible: async () => {
      await dragSliderLive(page, "warp.bend", 0.9);
    },
    rowId: "warp.direction",
    target: "warp.direction",
  });
  // Exercise the second option too, back to Horizontal.
  await selectOptionByTarget(page, "warp.direction", "Horizontal");
  await expect.poll(() => productCanvasHasInk(page)).toBe(true);
});
