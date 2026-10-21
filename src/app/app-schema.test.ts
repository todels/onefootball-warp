import { describe, expect, it } from "vitest";

import {
  appAcceptance,
  validateProductAcceptanceCoverage,
} from "./app-acceptance";
import { appPerformance } from "./app-performance";
import { appSchema } from "./app-schema";

describe("appSchema", () => {
  it("publishes the warp product app contract for AI assembly", () => {
    expect(appSchema.canvas.draggable).toBe(true);
    expect(appSchema.canvas.enabled).toBe(true);
    expect(appSchema.canvas.sizing).toEqual({ mode: "editable-output" });
    expect(appSchema.canvas.upload).toBe(true);
    expect(appSchema.canvas.renderScale.enabled).toBe(true);
    expect(appSchema.panels.controls?.sections[1]?.title).toBe("Settings");
    expect(appSchema.panels.layers).toBeUndefined();
    expect(appSchema.panels.timeline).toBeUndefined();
    expect(
      appSchema.modulePlan.capabilities.map(({ capabilityId }) => capabilityId),
    ).toEqual(
      expect.arrayContaining([
        "artifact.image-export",
        "artifact.svg-export",
        "media.source",
      ]),
    );
    expect(appSchema.modulePlan.modules.map(({ id }) => id)).toEqual(
      expect.arrayContaining(["image-export", "media-source", "svg-export"]),
    );
  });

  it("declares the product warp sections with the plugin's parameter ranges", () => {
    const sections = appSchema.panels.controls?.sections ?? [];
    const warp = sections.find((section) => section.id === "warp");
    expect(warp).toBeTruthy();
    const controls = warp?.controls ?? {};
    expect(controls["effect"]).toMatchObject({ target: "warp.effect", type: "tabs" });
    expect(controls["horizontal"]).toMatchObject({ max: 90, min: -90 });
    expect(controls["vertical"]).toMatchObject({ max: 90, min: -90 });
    expect(controls["depth"]).toMatchObject({ defaultValue: 50, max: 100, min: 0 });
    expect(controls["amount"]).toMatchObject({ max: 100, min: -100 });
    expect(controls["radius"]).toMatchObject({ defaultValue: 100, max: 150, min: 25 });
    expect(controls["bend"]).toMatchObject({ max: 100, min: -100 });
    const source = sections.find((section) => section.id === "source");
    expect(source?.controls["file"]).toMatchObject({
      target: "source.file",
      type: "fileDrop",
    });
  });

  it("does not imply timeline behavior for a still warp product", () => {
    expect(appSchema.assembly.capabilities).not.toContain("timeline.playback");
    expect(appSchema.assembly.capabilities).not.toContain("timeline.keyframes");
    expect(appSchema.assembly.commands).not.toContain(
      "timeline.toggleControlKeyframes",
    );
  });

  it("declares one scenario per canonical performance path", () => {
    expect(appPerformance.scenarios.length).toBe(7);
    expect(
      new Set(appPerformance.scenarios.map(({ pathId }) => pathId)).size,
    ).toBe(7);
    expect(
      appPerformance.workloadEnvelope.dimensions.map(({ id }) => id).sort(),
    ).toEqual(["export-long-edge", "source-megapixels"]);
  });

  it("declares production reload coverage for the product schema", () => {
    expect(appSchema.persistence.storage).toBe("localStorage");
    if (appSchema.persistence.storage !== "localStorage") {
      throw new Error("The product must persist its workspace in localStorage.");
    }
    expect(appSchema.persistence.include).toContain("canvas");
    expect(appSchema.persistence.include).toContain("media");
    expect(
      appAcceptance.find((entry) => entry.id === "persistence.reload"),
    ).toMatchObject({
      automated: true,
      browser: {
        budget: "extended-io",
        file: "e2e/product-persistence.spec.ts",
      },
      evidence: "persistence-state",
      kind: "runtime",
      persistenceCoverage: "reload",
      persistenceSlices: appSchema.persistence.include,
      target: "canvas.size.width",
    });
    expect(validateProductAcceptanceCoverage()).toEqual([]);
  });
});
