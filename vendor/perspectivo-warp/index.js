// Public surface of the vendored Perspectivo warp engine, plus the DOM-side
// helpers the web app needs (SVG serialization, decode, source decoding).

export {
  isIdentity,
  makeWarp,
  measureGeometry,
  warpRaster,
  warpSvg,
  warpSvgDoc,
  warpSvgPreview,
} from "./perspectivo-engine.js";

/** Serializes a warped SVG root with an explicit frame. */
export function serializeWarpedSvg(root, minX, minY, width, height) {
  root.setAttribute("width", String(width));
  root.setAttribute("height", String(height));
  root.setAttribute("viewBox", `${minX} ${minY} ${width} ${height}`);
  return new XMLSerializer().serializeToString(root);
}

/** Decodes SVG markup into a drawable image element. */
export function decodeSvgMarkup(markup, signal) {
  return new Promise((resolve, reject) => {
    const blob = new Blob([markup], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const image = new Image();
    const cleanup = () => URL.revokeObjectURL(url);
    const onAbort = () => {
      cleanup();
      reject(new Error("Aborted"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    image.onload = () => {
      signal?.removeEventListener("abort", onAbort);
      cleanup();
      resolve(image);
    };
    image.onerror = () => {
      signal?.removeEventListener("abort", onAbort);
      cleanup();
      reject(new Error("Could not decode the warped SVG."));
    };
    image.src = url;
  });
}

/** True when an SVG document embeds content that cannot ship in a
 * self-contained editable vector artifact. */
export function svgHasNonVectorContent(root) {
  return (
    root.getElementsByTagName("image").length > 0 ||
    root.getElementsByTagName("foreignObject").length > 0 ||
    root.getElementsByTagName("script").length > 0
  );
}

/** Imports the warped document's nodes into an export container inside one
 * placed group, so runtime SVG export receives namespace-aware vectors. */
export function appendWarpedGroup(container, root, placement) {
  const doc = container.ownerDocument;
  const group = doc.createElementNS("http://www.w3.org/2000/svg", "g");
  group.setAttribute("data-onefootball-warp", "true");
  group.setAttribute(
    "transform",
    `translate(${placement.translateX} ${placement.translateY}) scale(${placement.scale})`,
  );
  for (const child of Array.from(root.childNodes)) {
    group.append(doc.importNode(child, true));
  }
  container.append(group);
}

/** Decodes an uploaded source file (SVG text or raster bitmap), capping raster
 * sampling at `maxEdgePx` on the long edge. */
export async function decodeWarpSource(asset, url, maxEdgePx) {
  const response = await fetch(url);
  // Sniff SVG by mime, extension, or content — stored assets can come back
  // with a generic octet-stream type.
  const looksSvg =
    asset.mimeType === "image/svg+xml" || /\.svg$/iu.test(asset.fileName ?? "");
  if (looksSvg) {
    const text = await response.text();
    const doc = new DOMParser().parseFromString(text, "image/svg+xml");
    if (doc.getElementsByTagName("parsererror").length > 0) {
      throw new Error(`"${asset.fileName}" is not valid SVG.`);
    }
    return { fileName: asset.fileName, kind: "svg", text };
  }
  const blob = await response.blob();
  let bitmap = await createImageBitmap(blob);
  const longEdge = Math.max(bitmap.width, bitmap.height);
  if (longEdge > maxEdgePx) {
    const scale = maxEdgePx / longEdge;
    const scaled = document.createElement("canvas");
    scaled.width = Math.max(1, Math.round(bitmap.width * scale));
    scaled.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = scaled.getContext("2d");
    if (!context) throw new Error("Could not allocate a scaling context.");
    context.drawImage(bitmap, 0, 0, scaled.width, scaled.height);
    bitmap.close();
    bitmap = scaled;
  }
  return { bitmap, fileName: asset.fileName, kind: "raster" };
}

/** Releases a decoded source's backing bitmap. */
export function disposeWarpSource(source) {
  if (source.kind === "raster" && "close" in source.bitmap) {
    source.bitmap.close();
  }
}
