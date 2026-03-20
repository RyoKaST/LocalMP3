import { CurvePoint, TransitionStyle } from "../types";

// --- Bezier math ---

/** Evaluate cubic bezier at parameter t (0–1) for a single axis */
export function cubicBezier(t: number, p0: number, p1: number, p2: number, p3: number): number {
  const mt = 1 - t;
  return mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3;
}

/**
 * Build a gain lookup table (normalized time → gain) from a CurvePoint array.
 * Returns an array of `steps` gain values evenly spaced in time [0, 1].
 */
export function buildLookupTable(points: CurvePoint[], steps: number = 200): number[] {
  const table: number[] = new Array(steps + 1);

  for (let i = 0; i <= steps; i++) {
    const targetX = i / steps;
    table[i] = sampleCurveAtX(points, targetX);
  }

  return table;
}

/**
 * Sample the curve's Y value at a given X by finding which segment contains targetX,
 * then solving for the bezier parameter t that produces that X, then evaluating Y at t.
 */
function sampleCurveAtX(points: CurvePoint[], targetX: number): number {
  // Clamp to endpoints
  if (targetX <= 0) return points[0].y;
  if (targetX >= 1) return points[points.length - 1].y;

  // Find the segment
  let segIdx = 0;
  for (let i = 0; i < points.length - 1; i++) {
    if (targetX >= points[i].x && targetX <= points[i + 1].x) {
      segIdx = i;
      break;
    }
  }

  const p0 = points[segIdx];
  const p3 = points[segIdx + 1];

  // Control points (absolute positions from relative handles)
  const c1x = p0.x + p0.handleOut.x;
  const c1y = p0.y + p0.handleOut.y;
  const c2x = p3.x + p3.handleIn.x;
  const c2y = p3.y + p3.handleIn.y;

  // Binary search for t that gives us targetX
  let lo = 0, hi = 1;
  for (let iter = 0; iter < 20; iter++) {
    const mid = (lo + hi) / 2;
    const x = cubicBezier(mid, p0.x, c1x, c2x, p3.x);
    if (x < targetX) lo = mid;
    else hi = mid;
  }

  const t = (lo + hi) / 2;
  const y = cubicBezier(t, p0.y, c1y, c2y, p3.y);
  return Math.max(0, Math.min(1, y));
}

// --- Preset to points conversion ---

/** Convert a preset style to a set of CurvePoints for display in the editor */
export function presetToPoints(style: TransitionStyle, isOutgoing: boolean): CurvePoint[] {
  switch (style) {
    case "fade":
      return isOutgoing
        ? [
            { x: 0, y: 1, handleIn: { x: 0, y: 0 }, handleOut: { x: 0.33, y: 0 } },
            { x: 1, y: 0, handleIn: { x: -0.33, y: 0 }, handleOut: { x: 0, y: 0 } },
          ]
        : [
            { x: 0, y: 0, handleIn: { x: 0, y: 0 }, handleOut: { x: 0.33, y: 0 } },
            { x: 1, y: 1, handleIn: { x: -0.33, y: 0 }, handleOut: { x: 0, y: 0 } },
          ];

    case "rise":
      return isOutgoing
        ? [
            { x: 0, y: 1, handleIn: { x: 0, y: 0 }, handleOut: { x: 0.1, y: 0 } },
            { x: 0.3, y: 0, handleIn: { x: -0.1, y: 0 }, handleOut: { x: 0, y: 0 } },
            { x: 1, y: 0, handleIn: { x: -0.2, y: 0 }, handleOut: { x: 0, y: 0 } },
          ]
        : [
            { x: 0, y: 0, handleIn: { x: 0, y: 0 }, handleOut: { x: 0.2, y: 0 } },
            { x: 1, y: 1, handleIn: { x: -0.4, y: 0 }, handleOut: { x: 0, y: 0 } },
          ];

    case "cut":
      return isOutgoing
        ? [
            { x: 0, y: 1, handleIn: { x: 0, y: 0 }, handleOut: { x: 0.15, y: 0 } },
            { x: 0.5, y: 1, handleIn: { x: -0.15, y: 0 }, handleOut: { x: 0.01, y: 0 } },
            { x: 0.51, y: 0, handleIn: { x: -0.01, y: 0 }, handleOut: { x: 0.15, y: 0 } },
            { x: 1, y: 0, handleIn: { x: -0.15, y: 0 }, handleOut: { x: 0, y: 0 } },
          ]
        : [
            { x: 0, y: 0, handleIn: { x: 0, y: 0 }, handleOut: { x: 0.15, y: 0 } },
            { x: 0.49, y: 0, handleIn: { x: -0.15, y: 0 }, handleOut: { x: 0.01, y: 0 } },
            { x: 0.5, y: 1, handleIn: { x: -0.01, y: 0 }, handleOut: { x: 0.15, y: 0 } },
            { x: 1, y: 1, handleIn: { x: -0.15, y: 0 }, handleOut: { x: 0, y: 0 } },
          ];

    case "echo_out":
      // Echo Out uses convolver (reverb), cannot be represented as pure volume curve
      // Approximate as linear fade for display
      return isOutgoing
        ? [
            { x: 0, y: 1, handleIn: { x: 0, y: 0 }, handleOut: { x: 0.33, y: 0 } },
            { x: 1, y: 0, handleIn: { x: -0.33, y: 0 }, handleOut: { x: 0, y: 0 } },
          ]
        : [
            { x: 0, y: 0, handleIn: { x: 0, y: 0 }, handleOut: { x: 0.33, y: 0 } },
            { x: 1, y: 1, handleIn: { x: -0.33, y: 0 }, handleOut: { x: 0, y: 0 } },
          ];

    case "custom":
      // Should not happen — custom curves come from CustomCurves data
      return isOutgoing
        ? [
            { x: 0, y: 1, handleIn: { x: 0, y: 0 }, handleOut: { x: 0.33, y: 0 } },
            { x: 1, y: 0, handleIn: { x: -0.33, y: 0 }, handleOut: { x: 0, y: 0 } },
          ]
        : [
            { x: 0, y: 0, handleIn: { x: 0, y: 0 }, handleOut: { x: 0.33, y: 0 } },
            { x: 1, y: 1, handleIn: { x: -0.33, y: 0 }, handleOut: { x: 0, y: 0 } },
          ];
  }
}

// --- Constants ---

export const MAX_POINTS = 20;
export const MIN_X_GAP = 0.01;
export const HIT_RADIUS_POINT = 8;    // pixels
export const HIT_RADIUS_CURVE = 5;    // pixels

// --- Point manipulation ---

/** Clamp a point's x between its neighbors, enforcing MIN_X_GAP */
export function clampPointX(x: number, prevX: number, nextX: number): number {
  return Math.max(prevX + MIN_X_GAP, Math.min(nextX - MIN_X_GAP, x));
}

/** Clamp handle offsets to maintain x-monotonicity */
export function clampHandle(
  handle: { x: number; y: number },
  direction: "in" | "out",
): { x: number; y: number } {
  if (direction === "out") {
    return { x: Math.max(0, handle.x), y: handle.y };
  } else {
    return { x: Math.min(0, handle.x), y: handle.y };
  }
}

/** Create a new point at position (x, y) with default handles based on neighbors */
export function createPoint(
  x: number,
  y: number,
  prevPoint: CurvePoint,
  nextPoint: CurvePoint,
): CurvePoint {
  const handleLen = Math.min(
    (nextPoint.x - prevPoint.x) / 6,
    0.15,
  );
  return {
    x,
    y,
    handleIn: { x: -handleLen, y: 0 },
    handleOut: { x: handleLen, y: 0 },
  };
}

// --- Hit detection ---

export type HitTarget =
  | { type: "point"; curveId: "outgoing" | "incoming"; index: number }
  | { type: "handleIn"; curveId: "outgoing" | "incoming"; index: number }
  | { type: "handleOut"; curveId: "outgoing" | "incoming"; index: number }
  | { type: "curve"; curveId: "outgoing" | "incoming"; x: number; y: number }
  | null;

/**
 * Hit-test a canvas coordinate against all points, handles, and curve lines.
 * Points take priority over handles, handles over curve lines.
 */
export function hitTest(
  canvasX: number,
  canvasY: number,
  outgoingPoints: CurvePoint[],
  incomingPoints: CurvePoint[],
  canvasWidth: number,
  canvasHeight: number,
  padding: number,
): HitTarget {
  const drawW = canvasWidth - padding * 2;
  const drawH = canvasHeight - padding * 2;

  const toPixelX = (nx: number) => padding + nx * drawW;
  const toPixelY = (ny: number) => padding + (1 - ny) * drawH;
  const toNormX = (px: number) => (px - padding) / drawW;
  const toNormY = (py: number) => 1 - (py - padding) / drawH;

  // Check points first (both curves, priority to the one closer)
  for (const curveId of ["outgoing", "incoming"] as const) {
    const points = curveId === "outgoing" ? outgoingPoints : incomingPoints;
    for (let i = 0; i < points.length; i++) {
      const px = toPixelX(points[i].x);
      const py = toPixelY(points[i].y);
      const dist = Math.hypot(canvasX - px, canvasY - py);
      if (dist <= HIT_RADIUS_POINT) {
        return { type: "point", curveId, index: i };
      }
    }
  }

  // Check handles
  for (const curveId of ["outgoing", "incoming"] as const) {
    const points = curveId === "outgoing" ? outgoingPoints : incomingPoints;
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      // handleOut
      if (i < points.length - 1) {
        const hx = toPixelX(p.x + p.handleOut.x);
        const hy = toPixelY(p.y + p.handleOut.y);
        if (Math.hypot(canvasX - hx, canvasY - hy) <= HIT_RADIUS_POINT) {
          return { type: "handleOut", curveId, index: i };
        }
      }
      // handleIn
      if (i > 0) {
        const hx = toPixelX(p.x + p.handleIn.x);
        const hy = toPixelY(p.y + p.handleIn.y);
        if (Math.hypot(canvasX - hx, canvasY - hy) <= HIT_RADIUS_POINT) {
          return { type: "handleIn", curveId, index: i };
        }
      }
    }
  }

  // Check curve lines
  for (const curveId of ["outgoing", "incoming"] as const) {
    const points = curveId === "outgoing" ? outgoingPoints : incomingPoints;
    const table = buildLookupTable(points, 100);
    for (let i = 0; i <= 100; i++) {
      const nx = i / 100;
      const ny = table[i];
      const px = toPixelX(nx);
      const py = toPixelY(ny);
      if (Math.hypot(canvasX - px, canvasY - py) <= HIT_RADIUS_CURVE) {
        const normX = toNormX(canvasX);
        const normY = toNormY(canvasY);
        return { type: "curve", curveId, x: Math.max(0, Math.min(1, normX)), y: Math.max(0, Math.min(1, normY)) };
      }
    }
  }

  return null;
}
