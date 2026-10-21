import {
  defineToolcraft,
  imageExportModule,
  mediaSourceModule,
  svgExportModule,
} from "@/toolcraft/runtime";

import appDefaults from "./app-defaults.json" with { type: "json" };
import { appIdentity } from "./app-identity";
import { ONEFOOTBALL_LOGO_DATA_URL } from "./warp/onefootball-logo";
import { WARP_DEFAULTS, WARP_TARGETS } from "./warp/warp-params";
import {
  BACKGROUND_COLOR_TARGET,
  INCLUDE_BACKGROUND_TARGET,
  SOURCE_FILE_TARGET,
} from "./warp/warp-schema-targets";

const perspectiveOnly = {
  all: [{ equals: "perspective", target: WARP_TARGETS.effect }],
  mode: "conditional",
} as const;

const sphereOnly = {
  all: [{ equals: "sphere", target: WARP_TARGETS.effect }],
  mode: "conditional",
} as const;

const arcOnly = {
  all: [{ equals: "arc", target: WARP_TARGETS.effect }],
  mode: "conditional",
} as const;

export const appSchema = defineToolcraft({
  defaults: appDefaults,
  base: {
    canvas: {
      enabled: true,
      renderScale: true,
      sizing: { mode: "editable-output" },
      upload: true,
    },
    identity: appIdentity,
    media: {
      defaultAssets: [
        {
          assetKind: "file",
          dataUrl: ONEFOOTBALL_LOGO_DATA_URL,
          fileName: "onefootball.svg",
          id: "onefootball-logo",
          sourceTarget: SOURCE_FILE_TARGET,
        },
      ],
    },
    panels: {
      controls: {
        sections: [
          {
            controls: {
              file: {
                accept: ".svg,.png,.jpg,.jpeg,.webp",
                applicability: { mode: "always" },
                assetKind: "file",
                defaultValue: null,
                label: "Artwork",
                multiple: false,
                performanceReason:
                  "Upload responsiveness matters to the user; the decoded source's magnitude is modeled by the external-input source-megapixels dimension with its enforced 4096px sampling cap.",
                performanceRole: "responsiveness",
                target: SOURCE_FILE_TARGET,
                type: "fileDrop",
              },
            },
            id: "source",
            title: "Source",
          },
          {
            controls: {
              effect: {
                applicability: { mode: "always" },
                defaultValue: WARP_DEFAULTS.effect,
                keyframeable: false,
                label: "Effect",
                options: [
                  { label: "Perspective", value: "perspective" },
                  { label: "Sphere", value: "sphere" },
                  { label: "Arc", value: "arc" },
                ],
                performanceReason:
                  "Switching effects re-runs one constant-cost warp over the same sampled source.",
                performanceRole: "responsiveness",
                target: WARP_TARGETS.effect,
                type: "tabs",
              },
              horizontal: {
                applicability: perspectiveOnly,
                defaultValue: WARP_DEFAULTS.horizontal,
                label: "Horizontal",
                max: 90,
                min: -90,
                performanceReason:
                  "Dragging re-projects the preview each frame at constant per-pixel cost.",
                performanceRole: "responsiveness",
                sliderValueKind: "continuous",
                step: 1,
                target: WARP_TARGETS.horizontal,
                type: "slider",
                unit: "°",
              },
              vertical: {
                applicability: perspectiveOnly,
                defaultValue: WARP_DEFAULTS.vertical,
                label: "Vertical",
                max: 90,
                min: -90,
                performanceReason:
                  "Dragging re-projects the preview each frame at constant per-pixel cost.",
                performanceRole: "responsiveness",
                sliderValueKind: "continuous",
                step: 1,
                target: WARP_TARGETS.vertical,
                type: "slider",
                unit: "°",
              },
              depth: {
                applicability: perspectiveOnly,
                defaultValue: WARP_DEFAULTS.depth,
                label: "Depth",
                max: 100,
                min: 0,
                performanceReason:
                  "Dragging re-projects the preview each frame at constant per-pixel cost.",
                performanceRole: "responsiveness",
                sliderValueKind: "continuous",
                step: 1,
                target: WARP_TARGETS.depth,
                type: "slider",
              },
              amount: {
                applicability: sphereOnly,
                defaultValue: WARP_DEFAULTS.amount,
                label: "Amount",
                max: 100,
                min: -100,
                performanceReason:
                  "Dragging re-runs the radial warp each frame at constant per-pixel cost.",
                performanceRole: "responsiveness",
                sliderValueKind: "continuous",
                step: 1,
                target: WARP_TARGETS.amount,
                type: "slider",
              },
              radius: {
                applicability: sphereOnly,
                defaultValue: WARP_DEFAULTS.radius,
                label: "Radius",
                max: 150,
                min: 25,
                performanceReason:
                  "Dragging re-runs the radial warp each frame at constant per-pixel cost.",
                performanceRole: "responsiveness",
                sliderValueKind: "continuous",
                step: 1,
                target: WARP_TARGETS.radius,
                type: "slider",
              },
              round: {
                applicability: sphereOnly,
                defaultValue: WARP_DEFAULTS.round,
                description:
                  "Wraps onto a perfectly round 1:1 sphere instead of stretching with the artwork's proportions.",
                label: "Perfectly round",
                performanceReason:
                  "Toggling re-runs one constant-cost warp over the same sampled source.",
                performanceRole: "responsiveness",
                target: WARP_TARGETS.round,
                type: "switch",
              },
              clip: {
                applicability: sphereOnly,
                defaultValue: WARP_DEFAULTS.clip,
                description:
                  "Trims everything outside the sphere's rim instead of letting edges spill past it.",
                label: "Clip to sphere",
                performanceReason:
                  "Toggling re-runs one constant-cost warp over the same sampled source.",
                performanceRole: "responsiveness",
                target: WARP_TARGETS.clip,
                type: "switch",
              },
              bend: {
                applicability: arcOnly,
                defaultValue: WARP_DEFAULTS.bend,
                label: "Bend",
                max: 100,
                min: -100,
                performanceReason:
                  "Dragging re-runs the arc warp each frame at constant per-pixel cost.",
                performanceRole: "responsiveness",
                sliderValueKind: "continuous",
                step: 1,
                target: WARP_TARGETS.bend,
                type: "slider",
              },
              direction: {
                applicability: arcOnly,
                defaultValue: WARP_DEFAULTS.direction,
                keyframeable: false,
                label: "Direction",
                options: [
                  { label: "Horizontal", value: "h" },
                  { label: "Vertical", value: "v" },
                ],
                performanceReason:
                  "Switching direction re-runs one constant-cost warp over the same sampled source.",
                performanceRole: "responsiveness",
                target: WARP_TARGETS.direction,
                type: "select",
              },
            },
            id: "warp",
            title: "Warp",
          },
          {
            controls: {
              includeBackground: {
                applicability: { mode: "always" },
                defaultValue: true,
                performanceReason:
                  "Background fill is a runtime-owned surface; toggling never re-runs the warp.",
                performanceRole: "responsiveness",
                target: INCLUDE_BACKGROUND_TARGET,
                type: "switch",
              },
              backgroundColor: {
                applicability: { mode: "always" },
                defaultValue: "#000000",
                performanceReason:
                  "Background color is a runtime-owned surface; editing never re-runs the warp.",
                performanceRole: "responsiveness",
                target: BACKGROUND_COLOR_TARGET,
                type: "color",
              },
            },
            id: "background",
            title: "Background",
          },
        ],
        title: "Controls",
      },
    },
    toolbar: {
      history: true,
      radar: true,
      zoom: true,
    },
  },
  modules: [mediaSourceModule(), imageExportModule(), svgExportModule()],
});
