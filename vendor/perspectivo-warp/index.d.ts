export type WarpParams =
  | { mode: "perspective"; yaw: number; pitch: number; depth: number }
  | {
      mode: "bulge";
      amount: number;
      radius: number;
      round?: boolean;
      clip?: boolean;
    }
  | { mode: "arc"; bend: number; dir?: "h" | "v" };

export type WarpProjection = {
  project: (x: number, y: number) => [number, number];
  linear: boolean;
  region?: { rx: number; ry: number } | null;
  arc?: { R: number; flat: boolean; vertical: boolean };
};

export type WarpedRaster = {
  canvas: HTMLCanvasElement;
  minX: number;
  minY: number;
  width: number;
  height: number;
  scale: number;
};

export type WarpSource =
  | Readonly<{ kind: "svg"; text: string; fileName: string }>
  | Readonly<{
      bitmap: ImageBitmap | HTMLCanvasElement;
      fileName: string;
      kind: "raster";
    }>;

export function isIdentity(params: WarpParams): boolean;
export function makeWarp(
  params: WarpParams,
  width: number,
  height: number,
  originX: number,
  originY: number,
): WarpProjection;
export function measureGeometry(
  root: Element,
  baseMatrix: readonly number[],
): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  isValid(): boolean;
  track(point: readonly [number, number]): void;
};
export function warpRaster(
  source: CanvasImageSource & { width: number; height: number },
  params: WarpParams,
  opts?: { clip?: boolean; scale?: number },
): WarpedRaster | null;
export function warpSvg(svgText: string, params: WarpParams): string;
export function warpSvgDoc(
  svgText: string,
  params: WarpParams,
  detail?: number,
): {
  svg: SVGSVGElement;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  srcW: number;
  srcH: number;
};
export function warpSvgPreview(svgText: string, params: WarpParams): string;

export function serializeWarpedSvg(
  root: SVGSVGElement,
  minX: number,
  minY: number,
  width: number,
  height: number,
): string;
export function decodeSvgMarkup(
  markup: string,
  signal?: AbortSignal,
): Promise<HTMLImageElement>;
export function svgHasNonVectorContent(root: SVGSVGElement): boolean;
export function appendWarpedGroup(
  container: SVGGElement,
  root: SVGSVGElement,
  placement: Readonly<{ scale: number; translateX: number; translateY: number }>,
): void;
export function decodeWarpSource(
  asset: Readonly<{ fileName: string; mimeType: string }>,
  url: string,
  maxEdgePx: number,
): Promise<WarpSource>;
export function disposeWarpSource(source: WarpSource): void;
