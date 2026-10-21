// Perspectivo warp engine — spliced verbatim from ../../../ui.html (the
// published Figma plugin) so web and plugin warps stay numerically identical.
// Regenerate by re-running the splice (see docs/toolcraft/agent-worklog.md);
// do not hand-edit the engine body.
/* eslint-disable */
// @ts-nocheck


// Bumped on EVERY update. Shown in the footer so there is never any doubt
// about which build is running — a stale panel (opened before an update) or a
// stale Community version is instantly identifiable.
const APP_VERSION = '1.11.2';

/* ------------------------------------------------------------------ *
 * Affine matrices — SVG order [a, b, c, d, e, f]
 *   x' = a*x + c*y + e
 *   y' = b*x + d*y + f
 * ------------------------------------------------------------------ */

const IDENTITY = [1, 0, 0, 1, 0, 0];

// Returns m1 ∘ m2 — m2 is applied to the point first.
function matCompose(m1, m2) {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

function matApply(m, x, y) {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

// Average linear scale, used to keep stroke widths proportional.
function matScale(m) {
  const det = Math.abs(m[0] * m[3] - m[1] * m[2]);
  return Math.sqrt(det) || 1;
}

const TRANSFORM_RE = /([a-zA-Z]+)\s*\(([^)]*)\)/g;

function parseTransform(value) {
  if (!value) return IDENTITY;

  let result = IDENTITY;
  let match;
  TRANSFORM_RE.lastIndex = 0;

  while ((match = TRANSFORM_RE.exec(value)) !== null) {
    const name = match[1];
    const args = match[2].trim().split(/[\s,]+/).map(Number).filter((n) => !isNaN(n));
    let m = null;

    if (name === 'matrix' && args.length >= 6) {
      m = args.slice(0, 6);
    } else if (name === 'translate') {
      m = [1, 0, 0, 1, args[0] || 0, args[1] || 0];
    } else if (name === 'scale') {
      const sx = args[0] === undefined ? 1 : args[0];
      const sy = args[1] === undefined ? sx : args[1];
      m = [sx, 0, 0, sy, 0, 0];
    } else if (name === 'rotate') {
      const rad = ((args[0] || 0) * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const rot = [cos, sin, -sin, cos, 0, 0];
      if (args.length >= 3) {
        m = matCompose(
          matCompose([1, 0, 0, 1, args[1], args[2]], rot),
          [1, 0, 0, 1, -args[1], -args[2]]
        );
      } else {
        m = rot;
      }
    } else if (name === 'skewX') {
      m = [1, 0, Math.tan(((args[0] || 0) * Math.PI) / 180), 1, 0, 0];
    } else if (name === 'skewY') {
      m = [1, Math.tan(((args[0] || 0) * Math.PI) / 180), 0, 1, 0, 0];
    }

    if (m) result = matCompose(result, m);
  }

  return result;
}

/* ------------------------------------------------------------------ *
 * Perspective projection
 *
 * The shape lives on the plane z = 0. We rotate it about the horizontal
 * (pitch) and vertical (yaw) axes, then divide by depth. A planar rotation
 * followed by a perspective divide is exactly a homography, so this maps
 * every point correctly — no quad-fitting needed.
 * ------------------------------------------------------------------ */

// `originX`/`originY` are the point the shape rotates about. They default to the
// middle of the given box, but callers pass the artwork's real centre — which is
// not always the middle of the SVG (see measureGeometry).
function makeProjector(width, height, yawDeg, pitchDeg, depthPercent, originX, originY) {
  const yaw = (yawDeg * Math.PI) / 180;
  const pitch = (pitchDeg * Math.PI) / 180;
  const cosY = Math.cos(yaw);
  const sinY = Math.sin(yaw);
  const cosP = Math.cos(pitch);
  const sinP = Math.sin(pitch);

  const halfDiagonal = 0.5 * Math.sqrt(width * width + height * height) || 1;
  // depth 0 => focal ~32x the shape (near-orthographic), depth 100 => 1.5x (strong).
  const t = Math.min(Math.max(depthPercent / 100, 0), 1);
  const focal = halfDiagonal * Math.pow(2, 5 - 4.4 * t);

  const cx = originX === undefined ? width / 2 : originX;
  const cy = originY === undefined ? height / 2 : originY;

  const project = function (x, y) {
    const px = x - cx;
    const py = y - cy;

    // Rotate about the horizontal axis.
    const y1 = py * cosP;
    const z1 = py * sinP;

    // Then about the vertical axis.
    const x2 = px * cosY + z1 * sinY;
    const z2 = -px * sinY + z1 * cosY;

    // Perspective divide, clamped so a point never crosses the camera plane.
    const denom = Math.max(focal + z2, focal * 0.08);
    const s = focal / denom;

    return [x2 * s, y1 * s];
  };
  // The unclamped map is exactly this homography (centred coords). Exposed so
  // the raster inverse can invert it analytically instead of fitting corners —
  // a corner in the clamped zone would poison a fit, which shows up at high
  // Depth as the image landing wrong.
  project.H = [
    focal * cosY, focal * sinP * sinY, 0,
    0, focal * cosP, 0,
    -sinY, sinP * cosY, focal,
  ];
  project.focal = focal;
  return project;
}

/* ------------------------------------------------------------------ *
 * Path data parsing — normalises any `d` string to absolute M / L / C / Z
 * ------------------------------------------------------------------ */

function parsePathData(d) {
  let i = 0;
  const n = d.length;

  function skipSeparators() {
    while (i < n && (d[i] === ' ' || d[i] === ',' || d[i] === '\n' || d[i] === '\r' || d[i] === '\t')) i++;
  }

  function isDigit(c) {
    return c >= '0' && c <= '9';
  }

  function readNumber() {
    skipSeparators();
    const start = i;
    if (d[i] === '+' || d[i] === '-') i++;
    while (i < n && isDigit(d[i])) i++;
    if (d[i] === '.') {
      i++;
      while (i < n && isDigit(d[i])) i++;
    }
    if (d[i] === 'e' || d[i] === 'E') {
      i++;
      if (d[i] === '+' || d[i] === '-') i++;
      while (i < n && isDigit(d[i])) i++;
    }
    if (i === start) {
      i++; // never stall on malformed input
      return NaN;
    }
    return parseFloat(d.slice(start, i));
  }

  // Arc flags may be written unseparated ("a1 1 0 011 1"), so they are read
  // as single characters rather than as numbers.
  function readFlag() {
    skipSeparators();
    const c = d[i];
    i++;
    return c === '1' ? 1 : 0;
  }

  function peekIsCommand() {
    skipSeparators();
    const c = d[i];
    return c !== undefined && /[MmZzLlHhVvCcSsQqTtAa]/.test(c);
  }

  const subpaths = [];
  let current = null;
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  // Reflection points for the smooth variants S and T.
  let lastCubicControl = null;
  let lastQuadControl = null;
  let command = null;

  function push(seg) {
    if (!current) {
      current = { start: [x, y], segs: [], closed: false };
      subpaths.push(current);
    }
    current.segs.push(seg);
  }

  function moveTo(nx, ny) {
    current = { start: [nx, ny], segs: [], closed: false };
    subpaths.push(current);
    x = nx;
    y = ny;
    startX = nx;
    startY = ny;
  }

  function cubicTo(c1x, c1y, c2x, c2y, nx, ny) {
    push({ type: 'C', c1: [c1x, c1y], c2: [c2x, c2y], p: [nx, ny] });
    x = nx;
    y = ny;
  }

  while (i < n) {
    skipSeparators();
    if (i >= n) break;

    if (/[MmZzLlHhVvCcSsQqTtAa]/.test(d[i])) {
      command = d[i];
      i++;
    } else if (command === null) {
      i++;
      continue;
    } else if (command === 'M') {
      command = 'L';
    } else if (command === 'm') {
      command = 'l';
    }

    const rel = command >= 'a' && command <= 'z';
    const ox = rel ? x : 0;
    const oy = rel ? y : 0;

    switch (command.toUpperCase()) {
      case 'M': {
        const nx = readNumber() + ox;
        const ny = readNumber() + oy;
        moveTo(nx, ny);
        lastCubicControl = null;
        lastQuadControl = null;
        break;
      }
      case 'L': {
        const nx = readNumber() + ox;
        const ny = readNumber() + oy;
        push({ type: 'L', p: [nx, ny] });
        x = nx;
        y = ny;
        lastCubicControl = null;
        lastQuadControl = null;
        break;
      }
      case 'H': {
        const nx = readNumber() + ox;
        push({ type: 'L', p: [nx, y] });
        x = nx;
        lastCubicControl = null;
        lastQuadControl = null;
        break;
      }
      case 'V': {
        const ny = readNumber() + oy;
        push({ type: 'L', p: [x, ny] });
        y = ny;
        lastCubicControl = null;
        lastQuadControl = null;
        break;
      }
      case 'C': {
        const c1x = readNumber() + ox;
        const c1y = readNumber() + oy;
        const c2x = readNumber() + ox;
        const c2y = readNumber() + oy;
        const nx = readNumber() + ox;
        const ny = readNumber() + oy;
        cubicTo(c1x, c1y, c2x, c2y, nx, ny);
        lastCubicControl = [c2x, c2y];
        lastQuadControl = null;
        break;
      }
      case 'S': {
        const c2x = readNumber() + ox;
        const c2y = readNumber() + oy;
        const nx = readNumber() + ox;
        const ny = readNumber() + oy;
        const c1x = lastCubicControl ? 2 * x - lastCubicControl[0] : x;
        const c1y = lastCubicControl ? 2 * y - lastCubicControl[1] : y;
        cubicTo(c1x, c1y, c2x, c2y, nx, ny);
        lastCubicControl = [c2x, c2y];
        lastQuadControl = null;
        break;
      }
      case 'Q': {
        const qx = readNumber() + ox;
        const qy = readNumber() + oy;
        const nx = readNumber() + ox;
        const ny = readNumber() + oy;
        const c1x = x + (2 / 3) * (qx - x);
        const c1y = y + (2 / 3) * (qy - y);
        const c2x = nx + (2 / 3) * (qx - nx);
        const c2y = ny + (2 / 3) * (qy - ny);
        cubicTo(c1x, c1y, c2x, c2y, nx, ny);
        lastQuadControl = [qx, qy];
        lastCubicControl = [c2x, c2y];
        break;
      }
      case 'T': {
        const nx = readNumber() + ox;
        const ny = readNumber() + oy;
        const qx = lastQuadControl ? 2 * x - lastQuadControl[0] : x;
        const qy = lastQuadControl ? 2 * y - lastQuadControl[1] : y;
        const c1x = x + (2 / 3) * (qx - x);
        const c1y = y + (2 / 3) * (qy - y);
        const c2x = nx + (2 / 3) * (qx - nx);
        const c2y = ny + (2 / 3) * (qy - ny);
        cubicTo(c1x, c1y, c2x, c2y, nx, ny);
        lastQuadControl = [qx, qy];
        lastCubicControl = [c2x, c2y];
        break;
      }
      case 'A': {
        const rx = readNumber();
        const ry = readNumber();
        const rot = readNumber();
        const largeArc = readFlag();
        const sweep = readFlag();
        const nx = readNumber() + ox;
        const ny = readNumber() + oy;
        const curves = arcToCubics(x, y, rx, ry, rot, largeArc, sweep, nx, ny);
        if (curves.length === 0) {
          push({ type: 'L', p: [nx, ny] });
          x = nx;
          y = ny;
        } else {
          for (const c of curves) cubicTo(c[0], c[1], c[2], c[3], c[4], c[5]);
        }
        lastCubicControl = null;
        lastQuadControl = null;
        break;
      }
      case 'Z': {
        if (current) current.closed = true;
        x = startX;
        y = startY;
        current = null;
        lastCubicControl = null;
        lastQuadControl = null;
        break;
      }
      default:
        break;
    }

    // A command letter repeats implicitly until the next letter appears.
    if (command.toUpperCase() !== 'Z' && !peekIsCommand() && i < n) continue;
  }

  return subpaths.filter((sp) => sp.segs.length > 0 || sp.closed);
}

// Endpoint -> centre parameterisation, split into <=90° cubic segments.
function arcToCubics(x1, y1, rx, ry, angleDeg, largeArc, sweep, x2, y2) {
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  if (rx === 0 || ry === 0 || (x1 === x2 && y1 === y2)) return [];

  const phi = (angleDeg * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);

  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cosPhi * dx + sinPhi * dy;
  const y1p = -sinPhi * dx + cosPhi * dy;

  // Scale up the radii if they are too small to span the endpoints.
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    const s = Math.sqrt(lambda);
    rx *= s;
    ry *= s;
  }

  const rxSq = rx * rx;
  const rySq = ry * ry;
  const num = rxSq * rySq - rxSq * y1p * y1p - rySq * x1p * x1p;
  const den = rxSq * y1p * y1p + rySq * x1p * x1p;
  let coef = Math.sqrt(Math.max(0, num / den));
  if (largeArc === sweep) coef = -coef;

  const cxp = (coef * rx * y1p) / ry;
  const cyp = (-coef * ry * x1p) / rx;
  const cx = cosPhi * cxp - sinPhi * cyp + (x1 + x2) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (y1 + y2) / 2;

  function angle(ux, uy, vx, vy) {
    const dot = ux * vx + uy * vy;
    const len = Math.sqrt(ux * ux + uy * uy) * Math.sqrt(vx * vx + vy * vy);
    let a = Math.acos(Math.min(1, Math.max(-1, dot / (len || 1))));
    if (ux * vy - uy * vx < 0) a = -a;
    return a;
  }

  const ux = (x1p - cxp) / rx;
  const uy = (y1p - cyp) / ry;
  const vx = (-x1p - cxp) / rx;
  const vy = (-y1p - cyp) / ry;

  const theta1 = angle(1, 0, ux, uy);
  let delta = angle(ux, uy, vx, vy);
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  if (sweep && delta < 0) delta += 2 * Math.PI;

  const segments = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 2)));
  const step = delta / segments;
  const alpha = (4 / 3) * Math.tan(step / 4);

  const out = [];
  let theta = theta1;

  for (let s = 0; s < segments; s++) {
    const cosT1 = Math.cos(theta);
    const sinT1 = Math.sin(theta);
    const theta2 = theta + step;
    const cosT2 = Math.cos(theta2);
    const sinT2 = Math.sin(theta2);

    const e1x = cx + rx * cosPhi * cosT1 - ry * sinPhi * sinT1;
    const e1y = cy + rx * sinPhi * cosT1 + ry * cosPhi * sinT1;
    const e2x = cx + rx * cosPhi * cosT2 - ry * sinPhi * sinT2;
    const e2y = cy + rx * sinPhi * cosT2 + ry * cosPhi * sinT2;

    const d1x = -rx * cosPhi * sinT1 - ry * sinPhi * cosT1;
    const d1y = -rx * sinPhi * sinT1 + ry * cosPhi * cosT1;
    const d2x = -rx * cosPhi * sinT2 - ry * sinPhi * cosT2;
    const d2y = -rx * sinPhi * sinT2 + ry * cosPhi * cosT2;

    out.push([
      e1x + alpha * d1x,
      e1y + alpha * d1y,
      e2x - alpha * d2x,
      e2y - alpha * d2y,
      e2x,
      e2y,
    ]);

    theta = theta2;
  }

  return out;
}

/* ------------------------------------------------------------------ *
 * Bezier subdivision
 *
 * A projective map does not preserve cubic beziers, but over a short span
 * it is very close to affine. Splitting each curve into small pieces and
 * transforming their control points is visually exact.
 * ------------------------------------------------------------------ */

function splitCubicAt(p0, p1, p2, p3, t) {
  const lerp = (a, b) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const a = lerp(p0, p1);
  const b = lerp(p1, p2);
  const c = lerp(p2, p3);
  const d = lerp(a, b);
  const e = lerp(b, c);
  const f = lerp(d, e);
  return [[p0, a, d, f], [f, e, c, p3]];
}

function subdivideCubic(p0, p1, p2, p3, count) {
  if (count <= 1) return [[p0, p1, p2, p3]];

  const pieces = [];
  let rest = [p0, p1, p2, p3];

  for (let k = 0; k < count - 1; k++) {
    const t = 1 / (count - k);
    const [left, right] = splitCubicAt(rest[0], rest[1], rest[2], rest[3], t);
    pieces.push(left);
    rest = right;
  }

  pieces.push(rest);
  return pieces;
}

function controlPolygonLength(p0, p1, p2, p3) {
  const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  return dist(p0, p1) + dist(p1, p2) + dist(p2, p3);
}

/* ------------------------------------------------------------------ *
 * Element -> path data
 * ------------------------------------------------------------------ */

const KAPPA = 0.5522847498307936;

function num(el, name, fallback) {
  const raw = el.getAttribute(name);
  if (raw === null || raw === '') return fallback;
  const value = parseFloat(raw);
  return isNaN(value) ? fallback : value;
}

function pointsToPath(el, close) {
  const raw = (el.getAttribute('points') || '').trim();
  if (!raw) return '';
  const nums = raw.split(/[\s,]+/).map(Number).filter((v) => !isNaN(v));
  if (nums.length < 4) return '';

  let d = 'M' + nums[0] + ' ' + nums[1];
  for (let k = 2; k + 1 < nums.length; k += 2) {
    d += 'L' + nums[k] + ' ' + nums[k + 1];
  }
  return close ? d + 'Z' : d;
}

function ellipseToPath(cx, cy, rx, ry) {
  const ox = rx * KAPPA;
  const oy = ry * KAPPA;
  return (
    'M' + (cx - rx) + ' ' + cy +
    'C' + (cx - rx) + ' ' + (cy - oy) + ' ' + (cx - ox) + ' ' + (cy - ry) + ' ' + cx + ' ' + (cy - ry) +
    'C' + (cx + ox) + ' ' + (cy - ry) + ' ' + (cx + rx) + ' ' + (cy - oy) + ' ' + (cx + rx) + ' ' + cy +
    'C' + (cx + rx) + ' ' + (cy + oy) + ' ' + (cx + ox) + ' ' + (cy + ry) + ' ' + cx + ' ' + (cy + ry) +
    'C' + (cx - ox) + ' ' + (cy + ry) + ' ' + (cx - rx) + ' ' + (cy + oy) + ' ' + (cx - rx) + ' ' + cy +
    'Z'
  );
}

function rectToPath(el) {
  const x = num(el, 'x', 0);
  const y = num(el, 'y', 0);
  const w = num(el, 'width', 0);
  const h = num(el, 'height', 0);
  if (w <= 0 || h <= 0) return '';

  let rx = num(el, 'rx', NaN);
  let ry = num(el, 'ry', NaN);
  if (isNaN(rx) && isNaN(ry)) return 'M' + x + ' ' + y + 'H' + (x + w) + 'V' + (y + h) + 'H' + x + 'Z';
  if (isNaN(rx)) rx = ry;
  if (isNaN(ry)) ry = rx;
  rx = Math.min(rx, w / 2);
  ry = Math.min(ry, h / 2);

  return (
    'M' + (x + rx) + ' ' + y +
    'H' + (x + w - rx) +
    'A' + rx + ' ' + ry + ' 0 0 1 ' + (x + w) + ' ' + (y + ry) +
    'V' + (y + h - ry) +
    'A' + rx + ' ' + ry + ' 0 0 1 ' + (x + w - rx) + ' ' + (y + h) +
    'H' + (x + rx) +
    'A' + rx + ' ' + ry + ' 0 0 1 ' + x + ' ' + (y + h - ry) +
    'V' + (y + ry) +
    'A' + rx + ' ' + ry + ' 0 0 1 ' + (x + rx) + ' ' + y +
    'Z'
  );
}

function elementToPathData(el) {
  switch (el.tagName.toLowerCase()) {
    case 'path':
      return el.getAttribute('d') || '';
    case 'rect':
      return rectToPath(el);
    case 'circle': {
      const r = num(el, 'r', 0);
      return r > 0 ? ellipseToPath(num(el, 'cx', 0), num(el, 'cy', 0), r, r) : '';
    }
    case 'ellipse': {
      const rx = num(el, 'rx', 0);
      const ry = num(el, 'ry', 0);
      return rx > 0 && ry > 0 ? ellipseToPath(num(el, 'cx', 0), num(el, 'cy', 0), rx, ry) : '';
    }
    case 'line':
      return 'M' + num(el, 'x1', 0) + ' ' + num(el, 'y1', 0) + 'L' + num(el, 'x2', 0) + ' ' + num(el, 'y2', 0);
    case 'polyline':
      return pointsToPath(el, false);
    case 'polygon':
      return pointsToPath(el, true);
    default:
      return '';
  }
}

const SHAPE_TAGS = new Set(['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon']);

// Geometry inside these never renders — it defines clips, masks and fills for
// other elements. Figma routinely emits a full-bleed <clipPath><rect/> covering
// the whole export, which would otherwise masquerade as the artwork.
const NON_RENDERING_TAGS = new Set(['defs', 'clippath', 'mask', 'pattern', 'marker', 'symbol']);

// An explicit fill="none" with no stroke draws nothing. (An *absent* fill is
// black, so it does render.)
function isInvisibleShape(el) {
  if (el.getAttribute('display') === 'none') return true;

  const opacity = el.getAttribute('opacity');
  if (opacity !== null && parseFloat(opacity) === 0) return true;

  const stroke = el.getAttribute('stroke');
  const hasStroke = !!stroke && stroke !== 'none';
  const hasFill = el.getAttribute('fill') !== 'none';

  return !hasFill && !hasStroke;
}

/* ------------------------------------------------------------------ *
 * The warp itself
 * ------------------------------------------------------------------ */

function formatNumber(v) {
  return Math.abs(v) < 1e-4 ? '0' : parseFloat(v.toFixed(3)).toString();
}

// Malformed path data yields NaN coordinates. Those must never reach the
// output: a single NaN poisons the bounding box and collapses the node.
// The projector clamps its denominator, so a finite input always projects to
// a finite point — validating on the source side alone is enough.
function isFinitePoint(p) {
  return Number.isFinite(p[0]) && Number.isFinite(p[1]);
}

function makeTracker() {
  const box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  box.track = function (p) {
    if (p[0] < box.minX) box.minX = p[0];
    if (p[0] > box.maxX) box.maxX = p[0];
    if (p[1] < box.minY) box.minY = p[1];
    if (p[1] > box.maxY) box.maxY = p[1];
  };
  box.isValid = function () {
    return isFinitePoint([box.minX, box.minY]) && isFinitePoint([box.maxX, box.maxY]);
  };
  return box;
}

// Warps one `d` string into absolute commands: ['M',x,y] / ['L',x,y] /
// ['C',x1,y1,x2,y2,x3,y3] / ['Z']. Held as numbers rather than text so a caller
// can translate the result once the bounding box is known.
// Spherize. The planar distance from the centre is treated as arc length over a
// hemisphere and projected back orthographically: rn -> sin(rn·π/2). That gives
// moderate magnification at the centre (×π/2) and *infinite* compression at the
// rim — content squashes against the silhouette exactly as if wrapping around
// the back of a ball, which is what makes stripes taper into arcs. A plain
// radial power curve reads as "the middle inflates"; this reads as a sphere.
//
// Amount blends towards the full hemisphere (+100) or its inverse, the asin
// unwrap (-100), which dishes the shape inward like a hole. Both fix the
// boundary (sin/asin of 1 is 1), so the shape stays continuous with anything
// outside the region.
//
// At 100% radius the region's ellipse passes through the artwork's *corners*
// (the ×√2), not its edge midpoints — normalised to the inscribed ellipse a
// rectangle's whole outline would sit at rn >= 1 and never move. Corners
// anchor; everything inside wraps.
function makeBulge(width, height, amount, radiusPct, originX, originY, round) {
  const k = Math.min(Math.max(amount / 100, -1), 1);
  const pct = Math.min(Math.max(radiusPct / 100, 0.01), 10);
  // Default region is an ellipse matching the artwork's aspect — wide artwork
  // wraps onto a stretched ellipsoid. `round` uses one circular radius (the
  // half-diagonal, so corners still sit at rn = 1 at 100%): wide text then
  // wraps onto a true ball. On square artwork the two are identical.
  let ax, ay;
  if (round) {
    ax = ay = Math.max(1e-6, (Math.hypot(width, height) / 2) * pct);
  } else {
    ax = Math.max(1e-6, (width / 2) * pct * Math.SQRT2);
    ay = Math.max(1e-6, (height / 2) * pct * Math.SQRT2);
  }
  const HALF_PI = Math.PI / 2;

  const project = function (x, y) {
    const nx = (x - originX) / ax;
    const ny = (y - originY) / ay;
    const rn = Math.hypot(nx, ny);
    if (rn < 1e-9 || rn >= 1) return [x - originX, y - originY];

    const target = k >= 0 ? Math.sin(rn * HALF_PI) : Math.asin(rn) / HALF_PI;
    const mapped = rn + Math.abs(k) * (target - rn);
    const s = mapped / rn;
    return [nx * s * ax, ny * s * ay];
  };
  // The region ellipse in output (centred) coordinates — the sphere silhouette,
  // exposed so the clip toggle can cut to it.
  project.region = { rx: ax, ry: ay };
  return project;
}

// Illustrator-style arc bend. The artwork is bent along a circular arc: the
// horizontal centreline keeps its length (theta = k*pi, R = W/theta, so arc
// length R*theta = W exactly), verticals become radial spokes with their
// length preserved, and horizontals become concentric arcs. Positive bend is
// a rainbow (ends drop, middle holds), negative a valley.
function makeArc(width, height, bend, originX, originY, vertical) {
  const k = Math.min(Math.max(bend / 100, -1), 1);
  const flat = Math.abs(k) < 1e-4;
  const theta = k * Math.PI;
  // Vertical direction is the exact transpose: the VERTICAL centreline keeps
  // its length (R from the height), horizontals become radial spokes, and the
  // shape bows sideways — "(" for positive bend, ")" for negative.
  const R = flat ? Infinity : (vertical ? height : width) / theta;

  const project = function (x, y) {
    const px = x - originX;
    const py = y - originY;
    if (flat) return [px, py];
    if (vertical) {
      const phi = py / R;
      const rho = R - px;
      return [R - rho * Math.cos(phi), rho * Math.sin(phi)];
    }
    const phi = px / R;
    const rho = R - py;
    return [rho * Math.sin(phi), R - rho * Math.cos(phi)];
  };
  // Exposed for the closed-form raster inverse.
  project.arc = { R: R, flat: flat, vertical: !!vertical };
  return project;
}

// One entry point for both effects. `linear` records whether straight lines
// survive the map: true for perspective (it's a homography), false for bulge,
// where lines genuinely bend and must be subdivided like curves.
function makeWarp(params, width, height, originX, originY) {
  if (params.mode === 'bulge') {
    const project = makeBulge(width, height, params.amount || 0, params.radius || 100, originX, originY, !!params.round);
    return { project: project, linear: false, region: project.region };
  }
  if (params.mode === 'arc') {
    const project = makeArc(width, height, params.bend || 0, originX, originY, params.dir === 'v');
    return { project: project, linear: false, arc: project.arc };
  }
  return {
    project: makeProjector(
      width, height,
      params.yaw || 0, params.pitch || 0,
      params.depth === undefined ? 50 : params.depth,
      originX, originY
    ),
    linear: true,
  };
}

function warpPathCommands(d, matrix, warp, subdivisionUnit, track) {
  const project = warp.project;
  const subpaths = parsePathData(d);
  const cmds = [];

  for (const sp of subpaths) {
    // Track the pre-warp position so curves can be subdivided in source space.
    let srcCursor = matApply(matrix, sp.start[0], sp.start[1]);
    if (!isFinitePoint(srcCursor)) continue;

    const start = project(srcCursor[0], srcCursor[1]);
    track(start);
    cmds.push(['M', start[0], start[1]]);

    for (const seg of sp.segs) {
      if (seg.type === 'L') {
        const src = matApply(matrix, seg.p[0], seg.p[1]);
        if (!isFinitePoint(src)) continue;

        if (warp.linear) {
          // Straight lines stay straight under a projective map.
          const p = project(src[0], src[1]);
          track(p);
          cmds.push(['L', p[0], p[1]]);
        } else {
          // Under a radial map they bend, so sample along the segment.
          const len = Math.hypot(src[0] - srcCursor[0], src[1] - srcCursor[1]);
          const count = Math.min(64, Math.max(1, Math.ceil(len / subdivisionUnit)));
          for (let s = 1; s <= count; s++) {
            const t = s / count;
            const p = project(
              srcCursor[0] + (src[0] - srcCursor[0]) * t,
              srcCursor[1] + (src[1] - srcCursor[1]) * t
            );
            track(p);
            cmds.push(['L', p[0], p[1]]);
          }
        }
        srcCursor = src;
      } else {
        const c1 = matApply(matrix, seg.c1[0], seg.c1[1]);
        const c2 = matApply(matrix, seg.c2[0], seg.c2[1]);
        const p3 = matApply(matrix, seg.p[0], seg.p[1]);
        if (!isFinitePoint(c1) || !isFinitePoint(c2) || !isFinitePoint(p3)) continue;

        const length = controlPolygonLength(srcCursor, c1, c2, p3);
        const count = Math.min(64, Math.max(3, Math.ceil(length / subdivisionUnit)));
        const pieces = subdivideCubic(srcCursor, c1, c2, p3, count);

        for (const piece of pieces) {
          const a = project(piece[1][0], piece[1][1]);
          const b = project(piece[2][0], piece[2][1]);
          const e = project(piece[3][0], piece[3][1]);
          track(a);
          track(b);
          track(e);
          cmds.push(['C', a[0], a[1], b[0], b[1], e[0], e[1]]);
        }

        srcCursor = p3;
      }
    }

    if (sp.closed) {
      // Z draws an implicit straight line back to the subpath start. Under a
      // nonlinear warp that edge bends like any other, so sample along it and
      // let Z close only the final sliver.
      if (!warp.linear) {
        const start = matApply(matrix, sp.start[0], sp.start[1]);
        if (isFinitePoint(start) && isFinitePoint(srcCursor)) {
          const len = Math.hypot(start[0] - srcCursor[0], start[1] - srcCursor[1]);
          const count = Math.min(64, Math.max(1, Math.ceil(len / subdivisionUnit)));
          for (let s = 1; s < count; s++) {
            const t = s / count;
            const p = project(
              srcCursor[0] + (start[0] - srcCursor[0]) * t,
              srcCursor[1] + (start[1] - srcCursor[1]) * t
            );
            track(p);
            cmds.push(['L', p[0], p[1]]);
          }
        }
      }
      cmds.push(['Z']);
    }
  }

  return cmds;
}

// Bounds of a path's control points, which enclose the curve. Slightly generous
// on curvy shapes, but symmetric — so the centre it yields is accurate.
function measurePathData(d, matrix, box) {
  for (const sp of parsePathData(d)) {
    const start = matApply(matrix, sp.start[0], sp.start[1]);
    if (isFinitePoint(start)) box.track(start);

    for (const seg of sp.segs) {
      const points = seg.type === 'L' ? [seg.p] : [seg.c1, seg.c2, seg.p];
      for (const q of points) {
        const p = matApply(matrix, q[0], q[1]);
        if (isFinitePoint(p)) box.track(p);
      }
    }
  }
}

// Finds the artwork's true bounds, which the SVG's own width/viewBox often
// overstates: a drop shadow or blur expands the export region, a frame's bounds
// can exceed its contents, and clip/mask scaffolding spans the whole canvas.
// Pivoting on the viewBox instead of this rotates the shape about a point that
// isn't its centre, which looks like it's sliding off to one side.
function measureGeometry(root, baseMatrix) {
  const box = makeTracker();

  (function walk(el, matrix) {
    const tag = el.tagName ? el.tagName.toLowerCase() : '';
    if (NON_RENDERING_TAGS.has(tag)) return;

    const own = el.getAttribute && el.getAttribute('transform');
    const local = own ? matCompose(matrix, parseTransform(own)) : matrix;

    if (SHAPE_TAGS.has(tag)) {
      if (!isInvisibleShape(el)) {
        const d = elementToPathData(el);
        if (d) measurePathData(d, local, box);
      }
      return;
    }

    for (const child of el.childNodes) {
      if (child.nodeType === 1) walk(child, local);
    }
  })(root, baseMatrix);

  return box;
}

/* ------------------------------------------------------------------ *
 * Clipping geometry to the sphere
 *
 * Cuts the paths themselves against the region ellipse rather than hanging a
 * clip group off the result — the canvas gets plain trimmed vectors, with no
 * mask layer to carry around.
 * ------------------------------------------------------------------ */

const NOOP = function () {};

function trackCommands(cmds, track) {
  for (const c of cmds) {
    for (let i = 1; i < c.length; i += 2) track([c[i], c[i + 1]]);
  }
}

function evalCubic(p0, p1, p2, p3, t) {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return [
    a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
    a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1],
  ];
}

// Commands -> polylines. Clipping needs straight edges to intersect against.
function flattenCommands(cmds, step) {
  const subpaths = [];
  let cur = null;
  let cursor = [0, 0];

  for (const c of cmds) {
    if (c[0] === 'M') {
      cur = { pts: [[c[1], c[2]]], closed: false };
      subpaths.push(cur);
      cursor = [c[1], c[2]];
    } else if (!cur) {
      continue;
    } else if (c[0] === 'L') {
      cur.pts.push([c[1], c[2]]);
      cursor = [c[1], c[2]];
    } else if (c[0] === 'C') {
      const p1 = [c[1], c[2]];
      const p2 = [c[3], c[4]];
      const p3 = [c[5], c[6]];
      const len =
        Math.hypot(p1[0] - cursor[0], p1[1] - cursor[1]) +
        Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) +
        Math.hypot(p3[0] - p2[0], p3[1] - p2[1]);
      const n = Math.min(32, Math.max(1, Math.ceil(len / step)));
      for (let i = 1; i <= n; i++) cur.pts.push(evalCubic(cursor, p1, p2, p3, i / n));
      cursor = p3;
    } else if (c[0] === 'Z') {
      cur.closed = true;
      cur = null;
    }
  }

  return subpaths;
}

// Roots of |u0 + t·d|² = 1 in normalised (unit-circle) space, ascending.
function ellipseHits(a, b, rx, ry) {
  const ux = a[0] / rx;
  const uy = a[1] / ry;
  const dx = b[0] / rx - ux;
  const dy = b[1] / ry - uy;
  const qa = dx * dx + dy * dy;
  if (qa < 1e-12) return [];
  const qb = 2 * (ux * dx + uy * dy);
  const qc = ux * ux + uy * uy - 1;
  const disc = qb * qb - 4 * qa * qc;
  if (disc < 0) return [];
  const root = Math.sqrt(disc);
  const t1 = (-qb - root) / (2 * qa);
  const t2 = (-qb + root) / (2 * qa);
  return t1 <= t2 ? [t1, t2] : [t2, t1];
}

function lerpPoint(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

// Open paths (and stroke-only outlines) are simply severed at the boundary:
// the inside runs survive as separate open subpaths, cut flat at the rim.
function trimPolyline(pts, closed, rx, ry) {
  const outside = function (p) {
    const x = p[0] / rx;
    const y = p[1] / ry;
    return x * x + y * y > 1;
  };

  const list = closed && pts.length > 1 ? pts.concat([pts[0]]) : pts;
  const runs = [];
  let cur = [];

  for (let i = 0; i < list.length - 1; i++) {
    const a = list[i];
    const b = list[i + 1];
    const aIn = !outside(a);
    const bIn = !outside(b);

    if (aIn && bIn) {
      if (cur.length === 0) cur.push(a);
      cur.push(b);
    } else if (aIn && !bIn) {
      if (cur.length === 0) cur.push(a);
      const hit = ellipseHits(a, b, rx, ry).filter((t) => t >= 0 && t <= 1);
      cur.push(lerpPoint(a, b, hit.length ? hit[hit.length - 1] : 1));
      runs.push(cur);
      cur = [];
    } else if (!aIn && bIn) {
      const hit = ellipseHits(a, b, rx, ry).filter((t) => t >= 0 && t <= 1);
      cur = [lerpPoint(a, b, hit.length ? hit[0] : 0), b];
    } else {
      // Both ends outside, but the chord between them can still cross.
      const hit = ellipseHits(a, b, rx, ry);
      if (hit.length === 2 && hit[1] > 0 && hit[0] < 1) {
        const t0 = Math.max(0, hit[0]);
        const t1 = Math.min(1, hit[1]);
        if (t1 > t0) runs.push([lerpPoint(a, b, t0), lerpPoint(a, b, t1)]);
      }
    }
  }

  if (cur.length > 1) runs.push(cur);
  return runs;
}

// A disk is convex, so Sutherland–Hodgman clips filled regions against a
// polygonal approximation of it correctly — including the case where the
// subject swallows the whole sphere, which comes back as the sphere itself.
function clipPolygon(subject, clip) {
  let output = subject;

  for (let i = 0; i < clip.length; i++) {
    if (output.length === 0) return [];
    const a = clip[i];
    const b = clip[(i + 1) % clip.length];
    const ex = b[0] - a[0];
    const ey = b[1] - a[1];
    const side = function (p) {
      return ex * (p[1] - a[1]) - ey * (p[0] - a[0]);
    };

    const input = output;
    output = [];
    let prev = input[input.length - 1];
    let prevSide = side(prev);

    for (const cur of input) {
      const curSide = side(cur);
      if (curSide >= 0) {
        if (prevSide < 0) output.push(lerpPoint(prev, cur, prevSide / (prevSide - curSide)));
        output.push(cur);
      } else if (prevSide >= 0) {
        output.push(lerpPoint(prev, cur, prevSide / (prevSide - curSide)));
      }
      prev = cur;
      prevSide = curSide;
    }
  }

  return output;
}

function ellipsePolygon(rx, ry, steps) {
  const pts = [];
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    pts.push([Math.cos(a) * rx, Math.sin(a) * ry]);
  }
  return pts;
}

function clipCommands(cmds, region, step, detail, filled) {
  const rx = region.rx;
  const ry = region.ry;

  // Every control point inside a convex region means the whole curve is inside
  // (convex hull property), so untouched geometry keeps its curves intact.
  let allInside = true;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const c of cmds) {
    for (let i = 1; i < c.length; i += 2) {
      const x = c[i];
      const y = c[i + 1];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      const nx = x / rx;
      const ny = y / ry;
      if (nx * nx + ny * ny > 1) allInside = false;
    }
  }

  if (allInside) return cmds;
  if (minX > rx || maxX < -rx || minY > ry || maxY < -ry) return [];

  const steps = Math.min(256, Math.max(48, Math.ceil(Math.max(rx, ry) * (detail || 1) * 0.9)));
  const poly = filled ? ellipsePolygon(rx, ry, steps) : null;
  const out = [];

  function emit(points, close) {
    if (points.length < 2) return;
    out.push(['M', points[0][0], points[0][1]]);
    for (let i = 1; i < points.length; i++) out.push(['L', points[i][0], points[i][1]]);
    if (close) out.push(['Z']);
  }

  for (const sp of flattenCommands(cmds, step)) {
    if (sp.pts.length < 2) continue;

    if (filled && sp.closed) {
      const clipped = clipPolygon(sp.pts, poly);
      if (clipped.length >= 3) emit(clipped, true);
    } else {
      for (const run of trimPolyline(sp.pts, sp.closed, rx, ry)) emit(run, false);
    }
  }

  return out;
}

function stringifyCommands(cmds, dx, dy) {
  let out = '';
  for (const c of cmds) {
    if (c[0] === 'Z') {
      out += 'Z';
      continue;
    }
    out += c[0];
    for (let i = 1; i < c.length; i += 2) {
      out += (i > 1 ? ' ' : '') + formatNumber(c[i] + dx) + ' ' + formatNumber(c[i + 1] + dy);
    }
  }
  return out;
}

// Warps a VECTOR node's own path list. No SVG round-trip is involved, so when
// this is written back the node keeps its fills, strokes, effects, name and id.
// Coordinates are shifted to start at (0, 0), as Figma expects of node-local data.
function warpVectorPaths(paths, srcW, srcH, params) {
  // Pivot on the paths themselves rather than the node box — they don't always
  // start at (0,0), and the node box can include stroke bleed.
  const art = makeTracker();
  for (const p of paths) measurePathData(p.data, IDENTITY, art);
  const artW = art.isValid() ? art.maxX - art.minX : srcW;
  const artH = art.isValid() ? art.maxY - art.minY : srcH;

  const warp = makeWarp(
    params,
    Math.max(artW, 1),
    Math.max(artH, 1),
    art.isValid() ? (art.minX + art.maxX) / 2 : srcW / 2,
    art.isValid() ? (art.minY + art.maxY) / 2 : srcH / 2
  );
  const subdivisionUnit = Math.max(1, Math.hypot(artW, artH) / 60);
  const clipRegion = params.clip && warp.region ? warp.region : null;
  const box = makeTracker();

  const warped = [];
  for (const p of paths) {
    let cmds = warpPathCommands(p.data, IDENTITY, warp, subdivisionUnit, NOOP);
    if (clipRegion) {
      cmds = clipCommands(cmds, clipRegion, subdivisionUnit, 1, p.windingRule !== 'NONE');
    }
    if (cmds.length > 0) {
      trackCommands(cmds, box.track);
      warped.push({ windingRule: p.windingRule, cmds });
    }
  }

  if (warped.length === 0 || !box.isValid()) {
    throw new Error('No warpable geometry in this shape.');
  }

  return {
    paths: warped.map((w) => ({
      windingRule: w.windingRule,
      data: stringifyCommands(w.cmds, -box.minX, -box.minY),
    })),
    width: Math.max(1, box.maxX - box.minX),
    height: Math.max(1, box.maxY - box.minY),
  };
}

/* ------------------------------------------------------------------ *
 * Raster warping
 *
 * Vector paths can be pushed through the projector point by point. Pixels
 * can't — a tilted photo has to be *resampled*. The only sound way to do that
 * is inverse mapping: for every pixel of the output, ask where it came from
 * in the source and sample there. That leaves no holes and no double-writes,
 * which forward-mapping (pushing source pixels out) always produces.
 *
 * Perspective is a homography, so its inverse is a closed-form 3x3 matrix.
 * Sphere has no closed-form inverse, so it's inverted numerically per pixel
 * (the radial map is 1-D and monotonic, so a few Newton steps converge).
 * ------------------------------------------------------------------ */

// Solves the 3x3 homography H mapping four source corners to four destination
// points, via the standard 8-equation linear system (DLT). Returns H or null
// if degenerate.
function homographyFromCorners(src, dst) {
  // Build A·h = b for the 8 unknowns of H with h33 = 1.
  const A = [];
  const b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i];
    const [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  // Gaussian elimination with partial pivoting.
  const n = 8;
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    if (Math.abs(A[piv][c]) < 1e-12) return null;
    [A[c], A[piv]] = [A[piv], A[c]]; [b[c], b[piv]] = [b[piv], b[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      if (f === 0) continue;
      for (let k = c; k < n; k++) A[r][k] -= f * A[c][k];
      b[r] -= f * b[c];
    }
  }
  const h = b.map((v, i) => v / A[i][i]);
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

function invert3x3(m) {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) return null;
  const inv = 1 / det;
  return [
    A * inv, (c * h - b * i) * inv, (b * f - c * e) * inv,
    B * inv, (a * i - c * g) * inv, (c * d - a * f) * inv,
    C * inv, (b * g - a * h) * inv, (a * e - b * d) * inv,
  ];
}

function applyH(m, x, y) {
  const w = m[6] * x + m[7] * y + m[8];
  return [(m[0] * x + m[1] * y + m[2]) / w, (m[3] * x + m[4] * y + m[5]) / w];
}

// Builds an inverse sampler: output (projector-space) point -> source pixel.
// Returns { sample(x, y) -> [sx, sy] | null, bounds } for the given warp.
function makeInverseSampler(warp, params, srcW, srcH) {
  if (warp.linear) {
    // Perspective: the projector exposes its exact homography (centred
    // coords); invert it analytically. Pixels whose source point falls in the
    // camera-plane clamp zone are rejected — there the real (clamped) map is
    // no longer projective, and what the fold renders is degenerate anyway.
    const H = warp.project.H;
    const Hinv = H && invert3x3(H);
    if (!Hinv) return null;
    const focal = warp.project.focal;
    const cx = srcW / 2, cy = srcH / 2;
    const e = 1e-6;
    return {
      sample: function (x, y) {
        const p = applyH(Hinv, x, y);           // centred source point
        const w = H[6] * p[0] + H[7] * p[1] + H[8];
        if (w <= focal * 0.08) return null;      // clamped/fold zone
        const sx = p[0] + cx, sy = p[1] + cy;
        return sx >= -e && sx <= srcW + e && sy >= -e && sy <= srcH + e ? [sx, sy] : null;
      },
    };
  }

  if (params.mode === 'arc') {
    // Closed form: phi = atan(x / (R - y)) (|phi| <= pi/2 for |bend| <= 100),
    // rho = (R - y) / cos(phi), then px = R*phi, py = R - rho.
    const arc = warp.arc;
    const ox = srcW / 2, oy = srcH / 2;
    const e = 1e-6;
    if (!arc || arc.flat) {
      return { sample: function (x, y) {
        const sx = x + ox, sy = y + oy;
        return sx >= -e && sx <= srcW + e && sy >= -e && sy <= srcH + e ? [sx, sy] : null;
      } };
    }
    const R = arc.R;
    // atan2/hypot form: exact at phi = ±pi/2 (the ends at full bend, where a
    // cos division is singular) and uniform for negative R.
    const sgn = R < 0 ? -1 : 1;
    // A shape extending past the curvature centre (wide art + vertical bend,
    // or tall art + horizontal bend) FOLDS: the forward map is two-to-one
    // there and no single-valued inverse exists. Verify each pixel's
    // round-trip and render the folded region transparent instead of wrong.
    const verified = function (sx, sy, x, y) {
      if (!(sx >= -e && sx <= srcW + e && sy >= -e && sy <= srcH + e)) return null;
      const f = warp.project(sx, sy);
      return Math.hypot(f[0] - x, f[1] - y) <= 0.5 ? [sx, sy] : null;
    };
    if (arc.vertical) {
      return { sample: function (x, y) {
        const phi = Math.atan2(sgn * y, sgn * (R - x));
        const rho = sgn * Math.hypot(y, R - x);
        return verified(R - rho + ox, R * phi + oy, x, y);
      } };
    }
    return { sample: function (x, y) {
      const phi = Math.atan2(sgn * x, sgn * (R - y));
      const rho = sgn * Math.hypot(x, R - y);
      return verified(R * phi + ox, R - rho + oy, x, y);
    } };
  }

  // Sphere: the radial map rn -> f(rn) is monotonic on [0,1]. Invert it
  // numerically with Newton's method on the 1-D radius, then restore angle.
  const k = Math.min(Math.max((params.amount || 0) / 100, -1), 1);
  const region = warp.region;
  const HALF_PI = Math.PI / 2;
  const fwd = function (rn) {
    const target = k >= 0 ? Math.sin(rn * HALF_PI) : Math.asin(Math.min(1, rn)) / HALF_PI;
    return rn + Math.abs(k) * (target - rn);
  };
  const inv = function (r) {
    if (r <= 0) return 0;
    if (r >= 1) return r;
    let rn = r;
    for (let it = 0; it < 12; it++) {
      const fx = fwd(rn) - r;
      const d = (fwd(rn + 1e-5) - fwd(rn - 1e-5)) / 2e-5;
      if (Math.abs(d) < 1e-9) break;
      const next = rn - fx / d;
      if (Math.abs(next - rn) < 1e-7) { rn = next; break; }
      rn = Math.min(1, Math.max(0, next));
    }
    return rn;
  };
  const ox = srcW / 2, oy = srcH / 2;
  return {
    sample: function (x, y) {
      // x,y are projector-space (centred on the region origin).
      const nx = x / region.rx, ny = y / region.ry;
      const r = Math.hypot(nx, ny);
      let sx, sy;
      if (r < 1e-9 || r >= 1) { sx = x + ox; sy = y + oy; }
      else {
        const rn = inv(r);
        const sc = rn / r;
        sx = nx * sc * region.rx + ox;
        sy = ny * sc * region.ry + oy;
      }
      const e = 1e-6;
      return sx >= -e && sx <= srcW + e && sy >= -e && sy <= srcH + e ? [sx, sy] : null;
    },
  };
}

// Warps an image. `imageBitmap` is a decoded image; returns { canvas, minX,
// minY, width, height } in projector space, or null. Bilinear sampling with
// alpha; output canvas is cropped tight to the warped footprint.
function warpRaster(imageBitmap, params, opts) {
  const srcW = imageBitmap.width;
  const srcH = imageBitmap.height;
  if (!(srcW > 0 && srcH > 0)) return null;

  const warp = makeWarp(params, srcW, srcH, srcW / 2, srcH / 2);
  const sampler = makeInverseSampler(warp, params, srcW, srcH);
  if (!sampler) return null;

  // Footprint: forward-project a ring of boundary points.
  const box = makeTracker();
  const steps = 64;
  for (let i = 0; i < steps; i++) {
    const t = i / steps;
    box.track(warp.project(srcW * t, 0));
    box.track(warp.project(srcW, srcH * t));
    box.track(warp.project(srcW * (1 - t), srcH));
    box.track(warp.project(0, srcH * (1 - t)));
  }
  if (!box.isValid()) return null;

  // Optional clip to the sphere region.
  const clip = opts && opts.clip && warp.region ? warp.region : null;
  let minX = box.minX, minY = box.minY, maxX = box.maxX, maxY = box.maxY;
  if (clip) {
    minX = Math.max(minX, -clip.rx); maxX = Math.min(maxX, clip.rx);
    minY = Math.max(minY, -clip.ry); maxY = Math.min(maxY, clip.ry);
  }

  const scale = (opts && opts.scale) || 1;
  const outW = Math.max(1, Math.ceil((maxX - minX) * scale));
  const outH = Math.max(1, Math.ceil((maxY - minY) * scale));
  if (outW * outH > 64e6) return null; // refuse absurd allocations

  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = srcW; srcCanvas.height = srcH;
  const sctx = srcCanvas.getContext('2d', { willReadFrequently: true });
  sctx.drawImage(imageBitmap, 0, 0);
  const src = sctx.getImageData(0, 0, srcW, srcH).data;

  const out = document.createElement('canvas');
  out.width = outW; out.height = outH;
  const octx = out.getContext('2d');
  const img = octx.createImageData(outW, outH);
  const dst = img.data;

  const crx2 = clip ? clip.rx * clip.rx : 0;
  const cry2 = clip ? clip.ry * clip.ry : 0;

  for (let py = 0; py < outH; py++) {
    const y = minY + (py + 0.5) / scale;
    for (let px = 0; px < outW; px++) {
      const x = minX + (px + 0.5) / scale;
      if (clip && (x * x) / crx2 + (y * y) / cry2 > 1) continue;
      const s = sampler.sample(x, y);
      if (!s) continue;
      // Bilinear.
      const sx = s[0] - 0.5, sy = s[1] - 0.5;
      const x0 = Math.floor(sx), y0 = Math.floor(sy);
      const fx = sx - x0, fy = sy - y0;
      const x1 = Math.min(srcW - 1, Math.max(0, x0 + 1)), y1 = Math.min(srcH - 1, Math.max(0, y0 + 1));
      const cx0 = Math.min(srcW - 1, Math.max(0, x0)), cy0 = Math.min(srcH - 1, Math.max(0, y0));
      const i00 = (cy0 * srcW + cx0) * 4, i10 = (cy0 * srcW + x1) * 4;
      const i01 = (y1 * srcW + cx0) * 4, i11 = (y1 * srcW + x1) * 4;
      const o = (py * outW + px) * 4;
      for (let c = 0; c < 4; c++) {
        const top = src[i00 + c] * (1 - fx) + src[i10 + c] * fx;
        const bot = src[i01 + c] * (1 - fx) + src[i11 + c] * fx;
        dst[o + c] = top * (1 - fy) + bot * fy;
      }
    }
  }
  octx.putImageData(img, 0, 0);
  return { canvas: out, minX, minY, width: outW / scale, height: outH / scale, scale };
}

// An image leaf inside a container. Its pixels are pushed through the *frame's*
// warp (not its own), so it tilts coherently with the shapes around it.
function warpImageChild(ch, warp, params, originX, originY) {
  if (!ch.bitmap) return { id: ch.id, empty: true, image: true };
  const px = ch.pixelScale || 1;
  if (isIdentity(params)) {
    return { id: ch.id, empty: false, image: true, identity: true, png: [],
      x: ch.x, y: ch.y, width: ch.width, height: ch.height };
  }
  const W = ch.bitmap.width, H = ch.bitmap.height;
  // Leaf pixel -> frame units -> shared projection.
  const proj = (lx, ly) => warp.project(ch.x + lx / px, ch.y + ly / px);

  const box = makeTracker();
  for (let i = 0; i < 48; i++) {
    const t = i / 48;
    box.track(proj(W * t, 0)); box.track(proj(W, H * t));
    box.track(proj(W * (1 - t), H)); box.track(proj(0, H * (1 - t)));
  }
  if (!box.isValid()) return { id: ch.id, empty: true, image: true };

  const sampler = makeInverseSamplerFor(warp, proj, params, W, H, px, ch, originX, originY);
  if (!sampler) return { id: ch.id, empty: true, image: true };

  const clip = params.clip && warp.region ? warp.region : null;
  let minX = box.minX, minY = box.minY, maxX = box.maxX, maxY = box.maxY;
  if (clip) {
    minX = Math.max(minX, -clip.rx); maxX = Math.min(maxX, clip.rx);
    minY = Math.max(minY, -clip.ry); maxY = Math.min(maxY, clip.ry);
  }
  if (maxX <= minX || maxY <= minY) return { id: ch.id, empty: true, image: true };

  const outW = Math.max(1, Math.ceil((maxX - minX) * px));
  const outH = Math.max(1, Math.ceil((maxY - minY) * px));
  if (outW * outH > 64e6) return { id: ch.id, empty: true, image: true };

  const srcC = document.createElement('canvas'); srcC.width = W; srcC.height = H;
  const sctx = srcC.getContext('2d', { willReadFrequently: true }); sctx.drawImage(ch.bitmap, 0, 0);
  const src = sctx.getImageData(0, 0, W, H).data;
  const out = document.createElement('canvas'); out.width = outW; out.height = outH;
  const octx = out.getContext('2d'); const img = octx.createImageData(outW, outH); const dst = img.data;
  const crx2 = clip ? clip.rx * clip.rx : 0, cry2 = clip ? clip.ry * clip.ry : 0;
  let any = false;
  for (let py = 0; py < outH; py++) {
    const y = minY + (py + 0.5) / px;
    for (let qx = 0; qx < outW; qx++) {
      const x = minX + (qx + 0.5) / px;
      if (clip && (x * x) / crx2 + (y * y) / cry2 > 1) continue;
      const sp = sampler(x, y);
      if (!sp) continue;
      const sx = sp[0] - 0.5, sy = sp[1] - 0.5;
      const x0 = Math.floor(sx), y0 = Math.floor(sy), fx = sx - x0, fy = sy - y0;
      const cx0 = Math.min(W - 1, Math.max(0, x0)), cy0 = Math.min(H - 1, Math.max(0, y0));
      const x1 = Math.min(W - 1, cx0 + 1), y1 = Math.min(H - 1, cy0 + 1);
      const i00 = (cy0 * W + cx0) * 4, i10 = (cy0 * W + x1) * 4, i01 = (y1 * W + cx0) * 4, i11 = (y1 * W + x1) * 4;
      const o = (py * outW + qx) * 4;
      for (let c = 0; c < 4; c++) {
        const top = src[i00 + c] * (1 - fx) + src[i10 + c] * fx;
        const bot = src[i01 + c] * (1 - fx) + src[i11 + c] * fx;
        dst[o + c] = top * (1 - fy) + bot * fy;
      }
      any = true;
    }
  }
  if (!any) return { id: ch.id, empty: true, image: true };
  octx.putImageData(img, 0, 0);
  return {
    id: ch.id, empty: false, image: true, identity: false,
    png: canvasToPngBytes(out),
    x: minX + originX, y: minY + originY, width: maxX - minX, height: maxY - minY,
  };
}

// Inverse sampler for an image leaf under the frame's shared warp.
// Perspective: the shared map restricted to this leaf is still a homography
// (affine ∘ homography), so fit it from the leaf's 4 corners.
// Sphere: invert the radial map in frame space, then map back to leaf pixels.
function makeInverseSamplerFor(warp, proj, params, W, H, px, ch, originX, originY) {
  const e = 1e-6;
  if (params.mode === 'arc') {
    // Invert the frame's arc in frame-centred space, then map to leaf pixels.
    const arc = warp.arc;
    return function (x, y) {
      let fx, fy;
      if (!arc || arc.flat) { fx = x; fy = y; }
      else if (arc.vertical) {
        const R = arc.R;
        const sgn = R < 0 ? -1 : 1;
        const phi = Math.atan2(sgn * y, sgn * (R - x));
        const rho = sgn * Math.hypot(y, R - x);
        fx = R - rho;
        fy = R * phi;
      } else {
        const R = arc.R;
        const sgn = R < 0 ? -1 : 1;
        const phi = Math.atan2(sgn * x, sgn * (R - y));
        const rho = sgn * Math.hypot(x, R - y);
        fx = R * phi;
        fy = R - rho;
      }
      if (arc && !arc.flat) {
        // Reject folded pixels (see the standalone sampler): verify round-trip.
        const fwd = warp.project(fx + originX, fy + originY);
        if (Math.hypot(fwd[0] - x, fwd[1] - y) > 0.5) return null;
      }
      const lx = (fx + originX - ch.x) * px, ly = (fy + originY - ch.y) * px;
      return lx >= -e && lx <= W + e && ly >= -e && ly <= H + e ? [lx, ly] : null;
    };
  }
  if (warp.linear) {
    const Hm = warp.project.H;
    const Hinv = Hm && invert3x3(Hm);
    if (!Hinv) return null;
    const focal = warp.project.focal;
    return function (x, y) {
      const p = applyH(Hinv, x, y);             // frame-centred source
      const w = Hm[6] * p[0] + Hm[7] * p[1] + Hm[8];
      if (w <= focal * 0.08) return null;        // clamped/fold zone
      const lx = (p[0] + originX - ch.x) * px, ly = (p[1] + originY - ch.y) * px;
      return lx >= -e && lx <= W + e && ly >= -e && ly <= H + e ? [lx, ly] : null;
    };
  }
  const k = Math.min(Math.max((params.amount || 0) / 100, -1), 1);
  const region = warp.region;
  const HALF_PI = Math.PI / 2;
  const fwd = (rn) => rn + Math.abs(k) * ((k >= 0 ? Math.sin(rn * HALF_PI) : Math.asin(Math.min(1, rn)) / HALF_PI) - rn);
  const inv = (r) => {
    if (r <= 0) return 0; if (r >= 1) return r;
    let rn = r;
    for (let it = 0; it < 12; it++) {
      const fx = fwd(rn) - r, d = (fwd(rn + 1e-5) - fwd(rn - 1e-5)) / 2e-5;
      if (Math.abs(d) < 1e-9) break;
      const next = rn - fx / d;
      if (Math.abs(next - rn) < 1e-7) { rn = next; break; }
      rn = Math.min(1, Math.max(0, next));
    }
    return rn;
  };
  return function (x, y) {
    const nx = x / region.rx, ny = y / region.ry, r = Math.hypot(nx, ny);
    let fx, fy;
    if (r < 1e-9 || r >= 1) { fx = x; fy = y; }
    else { const sc = inv(r) / r; fx = nx * sc * region.rx; fy = ny * sc * region.ry; }
    const lx = (fx + originX - ch.x) * px, ly = (fy + originY - ch.y) * px;
    return lx >= -e && lx <= W + e && ly >= -e && ly <= H + e ? [lx, ly] : null;
  };
}

// Warps a container's children as one coherent scene. Every child's paths are
// lifted into the frame's coordinate space, a single warp is built over the
// frame's *combined* artwork bounds, and each child is pushed through it — so a
// frame full of shapes reads as one tilted plane rather than a pile of
// independently tilted pieces. Results come back per child, in node-local
// coordinates with the child's new offset, ready to write straight to
// vectorPaths + x/y. The frame itself is never touched.
function warpContainer(children, params) {
  // 1. Combined bounds in frame space. Bounds-only entries (leaves that
  // aren't capturable as paths yet) carry no geometry to warp, but they are
  // part of the artwork: leaving them out would shift the shared origin and
  // mis-centre every sibling.
  const art = makeTracker();
  for (const ch of children) {
    if (ch.image || ch.bounds) {
      art.track([ch.x, ch.y]); art.track([ch.x + ch.width, ch.y + ch.height]);
      continue;
    }
    const m = [1, 0, 0, 1, ch.x, ch.y];
    for (const p of ch.paths) measurePathData(p.data, m, art);
  }
  if (!art.isValid()) throw new Error('No warpable geometry in this frame.');

  const artW = Math.max(1, art.maxX - art.minX);
  const artH = Math.max(1, art.maxY - art.minY);
  const originX = (art.minX + art.maxX) / 2;
  const originY = (art.minY + art.maxY) / 2;
  const warp = makeWarp(params, artW, artH, originX, originY);
  const subdivisionUnit = Math.max(1, Math.hypot(artW, artH) / 60);
  const clipRegion = params.clip && warp.region ? warp.region : null;

  // 2. Warp each child through the shared projection.
  const out = [];
  for (const ch of children) {
    if (ch.bounds) continue; // vectorized on apply; nothing to warp yet
    if (ch.image) {
      out.push(warpImageChild(ch, warp, params, originX, originY));
      continue;
    }
    const m = [1, 0, 0, 1, ch.x, ch.y];
    const box = makeTracker();
    const warped = [];
    for (const p of ch.paths) {
      let cmds = warpPathCommands(p.data, m, warp, subdivisionUnit, NOOP);
      if (clipRegion) {
        cmds = clipCommands(cmds, clipRegion, subdivisionUnit, 1, p.windingRule !== 'NONE');
      }
      if (cmds.length > 0) {
        trackCommands(cmds, box.track);
        warped.push({ windingRule: p.windingRule, cmds });
      }
    }
    // A child clipped away entirely is reported empty so the caller can hide it.
    if (warped.length === 0 || !box.isValid()) {
      out.push({ id: ch.id, empty: true });
      continue;
    }
    // Projector space is centred on the origin; shift back into frame space so
    // the child's x/y is relative to the frame like before.
    out.push({
      id: ch.id,
      empty: false,
      x: box.minX + originX,
      y: box.minY + originY,
      width: Math.max(1, box.maxX - box.minX),
      height: Math.max(1, box.maxY - box.minY),
      paths: warped.map((w) => ({
        windingRule: w.windingRule,
        data: stringifyCommands(w.cmds, -box.minX, -box.minY),
      })),
    });
  }
  return out;
}

// Warps an entire SVG document and returns the mutated root plus the bounding
// box of the result, leaving the caller to decide how to frame it.
//
// `detail` scales curve subdivision. Canvas output uses 1 (sub-0.01px). The
// preview is only ~150px wide, so precision beyond a fraction of a pixel there is
// invisible — and on heavy artwork it costs both frame time and markup size.
// Figma exports an image fill as fill="url(#patternN)" where the pattern
// <use>s an <image> in defs. Those rects are placeholders, not artwork: the
// pixels are warped separately by the raster engine. Neutralise them so they
// neither skew the artwork bounds nor get imported as junk coloured rects.
function hideImagePlaceholders(doc) {
  const imageIds = new Set(Array.from(doc.getElementsByTagName('image')).map((im) => im.getAttribute('id')).filter(Boolean));
  const patternIds = new Set();
  for (const pat of Array.from(doc.getElementsByTagName('pattern'))) {
    const id = pat.getAttribute('id');
    if (!id) continue;
    if (pat.getElementsByTagName('image').length > 0) { patternIds.add(id); continue; }
    for (const use of Array.from(pat.getElementsByTagName('use'))) {
      const href = use.getAttribute('href') || use.getAttribute('xlink:href') || '';
      if (href.charAt(0) === '#' && imageIds.has(href.slice(1))) { patternIds.add(id); break; }
    }
  }
  if (patternIds.size === 0) return 0;
  let n = 0;
  for (const el of Array.from(doc.querySelectorAll('[fill]'))) {
    const m = /url\(#([^)]+)\)/.exec(el.getAttribute('fill') || '');
    if (m && patternIds.has(m[1])) {
      // Keep the element (its box anchors the artwork bounds — an image-only
      // frame must still measure as the image's size) but mark it so the
      // output pass strips it. The raster engine supplies the real pixels.
      el.setAttribute('data-image-placeholder', '1');
      n++;
    }
  }
  return n;
}

function warpSvgDoc(svgText, params, detail) {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('Could not read the exported SVG.');
  }

  const svg = doc.documentElement;
  hideImagePlaceholders(doc);

  // Work entirely in viewBox coordinates.
  let vbX = 0;
  let vbY = 0;
  let srcW = parseFloat(svg.getAttribute('width')) || 0;
  let srcH = parseFloat(svg.getAttribute('height')) || 0;

  const viewBox = svg.getAttribute('viewBox');
  if (viewBox) {
    const parts = viewBox.trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts.every((v) => !isNaN(v))) {
      vbX = parts[0];
      vbY = parts[1];
      srcW = parts[2];
      srcH = parts[3];
    }
  }

  if (!(srcW > 0) || !(srcH > 0)) throw new Error('The exported SVG has no size.');

  const baseMatrix = [1, 0, 0, 1, -vbX, -vbY];

  // Rotate about the artwork itself, not the middle of the exported canvas.
  const art = measureGeometry(svg, baseMatrix);
  const artW = art.isValid() ? art.maxX - art.minX : srcW;
  const artH = art.isValid() ? art.maxY - art.minY : srcH;
  const originX = art.isValid() ? (art.minX + art.maxX) / 2 : srcW / 2;
  const originY = art.isValid() ? (art.minY + art.maxY) / 2 : srcH / 2;

  // The warp is sized and centred off the artwork, so its strength means the
  // same thing whether or not the layer carries a shadow.
  const warp = makeWarp(params, Math.max(artW, 1), Math.max(artH, 1), originX, originY);
  const project = warp.project; // used by warpGradients
  const subdivisionUnit = Math.max(1, Math.hypot(artW, artH) / (60 * (detail || 1)));

  const box = makeTracker();
  const placeholders = [];
  let maxStroke = 0;
  let shapeCount = 0;

  const clipRegion = params.clip && warp.region ? warp.region : null;

  // Coordinates stay in projector space here; the viewBox does the framing.
  // Only rendering geometry contributes to the bounds — otherwise a full-bleed
  // clip rect would pad the result and shift the artwork off centre. Bounds are
  // taken after clipping so a trimmed shape reports its trimmed size.
  function warpPathData(d, matrix, visible, filled) {
    let cmds = warpPathCommands(d, matrix, warp, subdivisionUnit, NOOP);
    if (clipRegion) cmds = clipCommands(cmds, clipRegion, subdivisionUnit, detail || 1, filled);
    if (visible) trackCommands(cmds, box.track);
    return stringifyCommands(cmds, 0, 0);
  }

  // Compose transforms down the tree, then flatten them into the geometry.
  // `visible` is false inside clip/mask/defs: that geometry still gets warped so
  // it keeps lining up, but it must not influence the output bounds.
  function walk(el, matrix, visible) {
    const own = el.getAttribute && el.getAttribute('transform');
    const local = own ? matCompose(matrix, parseTransform(own)) : matrix;

    const tag = el.tagName ? el.tagName.toLowerCase() : '';
    const renders = visible && !NON_RENDERING_TAGS.has(tag);

    if (SHAPE_TAGS.has(tag)) {
      if (el.getAttribute('data-image-placeholder')) {
        // Contributes to the bounds (via measureGeometry) but must not survive
        // into the output as a coloured rect. Its footprint is recorded, in
        // document order, so the raster layer can sit exactly where the export
        // put the image — the children list is the wrong reference for that
        // before the first apply, when text and rounded shapes aren't captured
        // as paths yet and a partial artwork slides its origin.
        if (renders) {
          const pd = elementToPathData(el);
          if (pd) {
            const t = makeTracker();
            measurePathData(pd, local, t);
            if (t.isValid()) placeholders.push({ minX: t.minX, minY: t.minY, maxX: t.maxX, maxY: t.maxY });
          }
        }
        el.parentNode.removeChild(el);
        return;
      }
      const d = elementToPathData(el);
      if (d) {
        const warped = warpPathData(
          d,
          local,
          renders && !isInvisibleShape(el),
          el.getAttribute('fill') !== 'none'
        );
        if (!warped) {
          // Geometry we could read but not warp must not survive unwarped.
          el.parentNode.removeChild(el);
          return;
        }
        {
          shapeCount++;

          const replacement = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
          for (const attr of Array.from(el.attributes)) {
            const name = attr.name;
            // Geometry attributes are baked into `d`; the transform is baked in too.
            if (name === 'transform' || name === 'd' || name === 'points') continue;
            if (['x', 'y', 'width', 'height', 'rx', 'ry', 'cx', 'cy', 'r', 'x1', 'y1', 'x2', 'y2'].indexOf(name) !== -1) continue;
            replacement.setAttribute(name, attr.value);
          }
          replacement.setAttribute('d', warped);

          const strokeWidth = el.getAttribute('stroke-width');
          if (strokeWidth !== null) {
            const scaled = (parseFloat(strokeWidth) || 0) * matScale(local);
            replacement.setAttribute('stroke-width', formatNumber(scaled));
            maxStroke = Math.max(maxStroke, scaled);
          } else if (el.getAttribute('stroke')) {
            maxStroke = Math.max(maxStroke, matScale(local));
          }

          el.parentNode.replaceChild(replacement, el);
          return;
        }
      }
    }

    const children = Array.from(el.childNodes);
    for (const child of children) {
      if (child.nodeType === 1) walk(child, local, renders);
    }

    if (el.removeAttribute && own && tag !== 'lineargradient' && tag !== 'radialgradient') {
      el.removeAttribute('transform');
    }
  }

  // Figma exports effects (drop/inner shadows, blurs) as <filter> elements with
  // an explicit userSpaceOnUse region sized to the *original* artwork. The warp
  // moves geometry into a new space centred on the origin, so that stale region
  // no longer overlaps the shape — and a filter region clips its output, which
  // is why effected shapes rendered shoved into one corner. Re-fit every region
  // to the warped bounds, with room for the effect itself to bleed.
  function refitEffectRegions() {
    if (!box.isValid()) return;
    const w = box.maxX - box.minX;
    const h = box.maxY - box.minY;
    // Shadows and blurs extend well past the geometry; 50% each side is ample
    // and only costs raster area, never correctness.
    const padX = Math.max(w, 1) * 0.5 + 16;
    const padY = Math.max(h, 1) * 0.5 + 16;
    const regions = ['filter', 'mask', 'pattern'];
    for (const tag of regions) {
      for (const el of Array.from(doc.getElementsByTagName(tag))) {
        const unitsAttr = tag === 'filter' ? 'filterUnits' : tag === 'mask' ? 'maskUnits' : 'patternUnits';
        if (el.getAttribute(unitsAttr) !== 'userSpaceOnUse') continue;
        el.setAttribute('x', formatNumber(box.minX - padX));
        el.setAttribute('y', formatNumber(box.minY - padY));
        el.setAttribute('width', formatNumber(w + padX * 2));
        el.setAttribute('height', formatNumber(h + padY * 2));
      }
    }
  }

  // Gradients defined in user space must follow the geometry. A linear gradient
  // stays linear if we map its two defining points; a radial one is approximated
  // by mapping its centre and scaling the radius.
  function warpGradients() {
    const linear = Array.from(doc.getElementsByTagName('linearGradient'));
    for (const g of linear) {
      if ((g.getAttribute('gradientUnits') || 'objectBoundingBox') !== 'userSpaceOnUse') continue;
      const gm = matCompose(baseMatrix, parseTransform(g.getAttribute('gradientTransform')));
      const p1 = matApply(gm, num(g, 'x1', 0), num(g, 'y1', 0));
      const p2 = matApply(gm, num(g, 'x2', srcW), num(g, 'y2', 0));
      const w1 = project(p1[0], p1[1]);
      const w2 = project(p2[0], p2[1]);
      g.setAttribute('x1', formatNumber(w1[0]));
      g.setAttribute('y1', formatNumber(w1[1]));
      g.setAttribute('x2', formatNumber(w2[0]));
      g.setAttribute('y2', formatNumber(w2[1]));
      g.removeAttribute('gradientTransform');
    }

    const radial = Array.from(doc.getElementsByTagName('radialGradient'));
    for (const g of radial) {
      if ((g.getAttribute('gradientUnits') || 'objectBoundingBox') !== 'userSpaceOnUse') continue;
      const gm = matCompose(baseMatrix, parseTransform(g.getAttribute('gradientTransform')));
      const r = num(g, 'r', 0);
      const c = matApply(gm, num(g, 'cx', 0), num(g, 'cy', 0));
      const edge = matApply(gm, num(g, 'cx', 0) + r, num(g, 'cy', 0));
      const wc = project(c[0], c[1]);
      const we = project(edge[0], edge[1]);
      g.setAttribute('cx', formatNumber(wc[0]));
      g.setAttribute('cy', formatNumber(wc[1]));
      g.setAttribute('r', formatNumber(Math.hypot(we[0] - wc[0], we[1] - wc[1])));
      if (g.getAttribute('fx') !== null) g.removeAttribute('fx');
      if (g.getAttribute('fy') !== null) g.removeAttribute('fy');
      g.removeAttribute('gradientTransform');
    }
  }

  walk(svg, baseMatrix, true);
  warpGradients();
  refitEffectRegions();

  // An image-only frame legitimately has no vector shapes — its content is
  // carried by the raster engine — so only an empty bounding box is an error.
  if (!box.isValid()) {
    if (shapeCount === 0 && art.isValid()) {
      // Nothing rendered but the artwork box is known: frame that box.
      const ox = originX, oy = originY;
      box.track([art.minX - ox, art.minY - oy]);
      box.track([art.maxX - ox, art.maxY - oy]);
    } else {
      throw new Error('No warpable geometry in this shape.');
    }
  }

  // Only strokes bleed outside the geometry, so only they need headroom.
  const pad = maxStroke > 0 ? maxStroke / 2 + 1 : 0;

  svg.removeAttribute('style');

  return {
    svg,
    region: warp.region || null,
    // The export's own frame: warp + origin + image footprints, so the raster
    // layer can composite in exactly the space the vectors were warped in.
    warp,
    originX,
    originY,
    placeholders,
    // The artwork's own size — what the preview should frame against, not the
    // exported canvas size.
    srcW: Math.max(artW, 1),
    srcH: Math.max(artH, 1),
    minX: box.minX - pad,
    minY: box.minY - pad,
    maxX: box.maxX + pad,
    maxY: box.maxY + pad,
  };
}

function frameSvg(root, minX, minY, width, height) {
  root.setAttribute('width', formatNumber(width));
  root.setAttribute('height', formatNumber(height));
  root.setAttribute(
    'viewBox',
    formatNumber(minX) + ' ' + formatNumber(minY) + ' ' +
      formatNumber(width) + ' ' + formatNumber(height)
  );
  return new XMLSerializer().serializeToString(root);
}

// Output destined for the canvas: cropped tight to the warped geometry.
function warpSvg(svgText, params) {
  const r = warpSvgDoc(svgText, params);
  return frameSvg(
    r.svg,
    r.minX,
    r.minY,
    Math.max(1, r.maxX - r.minX),
    Math.max(1, r.maxY - r.minY)
  );
}

// Output destined for the panel: framed against a *fixed* window derived from
// the original size, so the shape visibly shrinks and recedes as you drag rather
// than being re-fitted to the box on every frame. The window is centred on the
// projection origin and only grows if an extreme warp would otherwise clip.
function warpSvgPreview(svgText, params) {
  const r = warpSvgDoc(svgText, params, 0.3);
  const halfW = Math.max(r.srcW * 0.62, Math.abs(r.minX), Math.abs(r.maxX)) * 1.04;
  const halfH = Math.max(r.srcH * 0.62, Math.abs(r.minY), Math.abs(r.maxY)) * 1.04;
  return frameSvg(r.svg, -halfW, -halfH, halfW * 2, halfH * 2);
}
// ---- ESM surface (hand-authored wrapper; keep engine body verbatim above) ----
function isIdentity(params) {
  if (params.mode === 'bulge') return (params.amount || 0) === 0 && !params.clip;
  if (params.mode === 'arc') return (params.bend || 0) === 0;
  return (params.yaw || 0) === 0 && (params.pitch || 0) === 0;
}

export {
  isIdentity,
  makeWarp,
  measureGeometry,
  warpRaster,
  warpSvg,
  warpSvgDoc,
  warpSvgPreview,
};
