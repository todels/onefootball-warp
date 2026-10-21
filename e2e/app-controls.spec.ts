// Unregistered smoke checks for the Onefootball Warp product shell.

import { expect, test } from "./toolcraft-product-test";

import { svgFixtureFile, uploadSource } from "./product-warp-support";

test("browser: the warp product shell exposes its sections", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator('[data-slot="toolcraft-runtime-app"]')).toBeVisible();
  await expect(
    page.getByRole("application", { name: "Canvas viewport" }),
  ).toBeVisible();
  await expect(page.getByText("Source", { exact: true })).toBeVisible();
  await expect(page.getByText("Warp", { exact: true })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Perspective" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Export PNG/ })).toBeVisible();
});

test("browser: canvas drop routes a source file into the uploader", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator('[data-slot="toolcraft-runtime-app"]')).toBeVisible();
  await expect(
    page.locator('[data-toolcraft-control-target="source.file"]'),
  ).toBeVisible();
  await uploadSource(page, svgFixtureFile());
  await expect(
    page.locator('[data-slot="file-upload-file-item"]'),
  ).toContainText("of-badge.svg");
});
