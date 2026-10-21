import { isIdentity, type WarpParams } from "perspectivo-warp";

export const WARP_TARGETS = {
  amount: "warp.amount",
  bend: "warp.bend",
  clip: "warp.clip",
  depth: "warp.depth",
  direction: "warp.direction",
  effect: "warp.effect",
  horizontal: "warp.horizontal",
  radius: "warp.radius",
  round: "warp.round",
  vertical: "warp.vertical",
} as const;

export const WARP_DEFAULTS = {
  amount: 0,
  bend: 0,
  clip: false,
  depth: 50,
  direction: "h",
  effect: "perspective",
  horizontal: 0,
  radius: 100,
  round: false,
  vertical: 0,
} as const;

type WarpValues = Readonly<Record<string, unknown>>;

function readNumber(values: WarpValues, target: string, fallback: number): number {
  const value = values[target];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readBoolean(values: WarpValues, target: string, fallback: boolean): boolean {
  const value = values[target];
  return typeof value === "boolean" ? value : fallback;
}

/** One canonical mapping from runtime values to engine parameters. */
export function buildWarpParams(values: WarpValues): WarpParams {
  const effect = values[WARP_TARGETS.effect];
  if (effect === "sphere") {
    return {
      amount: readNumber(values, WARP_TARGETS.amount, WARP_DEFAULTS.amount),
      clip: readBoolean(values, WARP_TARGETS.clip, WARP_DEFAULTS.clip),
      mode: "bulge",
      radius: readNumber(values, WARP_TARGETS.radius, WARP_DEFAULTS.radius),
      round: readBoolean(values, WARP_TARGETS.round, WARP_DEFAULTS.round),
    };
  }
  if (effect === "arc") {
    return {
      bend: readNumber(values, WARP_TARGETS.bend, WARP_DEFAULTS.bend),
      dir: values[WARP_TARGETS.direction] === "v" ? "v" : "h",
      mode: "arc",
    };
  }
  return {
    depth: readNumber(values, WARP_TARGETS.depth, WARP_DEFAULTS.depth),
    mode: "perspective",
    pitch: readNumber(values, WARP_TARGETS.vertical, WARP_DEFAULTS.vertical),
    yaw: readNumber(values, WARP_TARGETS.horizontal, WARP_DEFAULTS.horizontal),
  };
}

export function isIdentityWarp(params: WarpParams): boolean {
  return isIdentity(params);
}

/** Contain-fit a box into a frame; the product frame is the authored domain. */
export function fitContain(
  contentWidth: number,
  contentHeight: number,
  frameWidth: number,
  frameHeight: number,
  margin = 0.04,
): { scale: number; width: number; height: number } {
  const usableW = frameWidth * (1 - margin * 2);
  const usableH = frameHeight * (1 - margin * 2);
  const scale = Math.min(
    usableW / Math.max(1, contentWidth),
    usableH / Math.max(1, contentHeight),
  );
  return {
    height: contentHeight * scale,
    scale,
    width: contentWidth * scale,
  };
}
