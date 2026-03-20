import { useRef, useEffect, useState, useCallback } from "react";
import { CurvePoint, CustomCurves, TransitionStyle } from "../types";
import {
  presetToPoints,
  hitTest,
  HitTarget,
  clampPointX,
  clampHandle,
  createPoint,
  MAX_POINTS,
} from "../audio/curveUtils";

interface CurveEditorProps {
  waveformA: number[];
  waveformB: number[];
  style: TransitionStyle;
  customCurves: CustomCurves | null;
  loading: boolean;
  height?: number;
  onChange: (curves: CustomCurves) => void;
}

const PADDING = 12;

export default function CurveEditor({
  waveformA,
  waveformB,
  style,
  customCurves,
  loading,
  height = 200,
  onChange,
}: CurveEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selectedTarget, setSelectedTarget] = useState<HitTarget>(null);
  const draggingRef = useRef<HitTarget>(null);

  // Get current points: either from customCurves or computed from preset
  const getPoints = useCallback((): { outgoing: CurvePoint[]; incoming: CurvePoint[] } => {
    if (customCurves) {
      return { outgoing: customCurves.outgoing, incoming: customCurves.incoming };
    }
    return {
      outgoing: presetToPoints(style, true),
      incoming: presetToPoints(style, false),
    };
  }, [customCurves, style]);

  // --- Drawing ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const width = rect.width || 400;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    if (loading) {
      ctx.fillStyle = "rgba(255,255,255,0.05)";
      ctx.fillRect(0, 0, width, height);
      return;
    }

    const drawW = width - PADDING * 2;
    const drawH = height - PADDING * 2;
    const toX = (nx: number) => PADDING + nx * drawW;
    const toY = (ny: number) => PADDING + (1 - ny) * drawH;

    // Grid lines
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    for (const frac of [0.25, 0.5, 0.75]) {
      const gy = toY(frac);
      ctx.beginPath();
      ctx.moveTo(PADDING, gy);
      ctx.lineTo(width - PADDING, gy);
      ctx.stroke();
    }
    // Center vertical dashed line
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    const cx = toX(0.5);
    ctx.beginPath();
    ctx.moveTo(cx, PADDING);
    ctx.lineTo(cx, height - PADDING);
    ctx.stroke();
    ctx.setLineDash([]);

    // Waveforms background
    const halfW = drawW / 2;
    drawWaveformBars(ctx, waveformA, PADDING, halfW, height, "rgba(255,255,255,0.12)");
    drawWaveformBars(ctx, waveformB, PADDING + halfW, halfW, height, "rgba(255,255,255,0.12)");

    // Labels
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.font = "10px system-ui";
    ctx.fillText("1.0", 2, PADDING + 10);
    ctx.fillText("0.0", 2, height - PADDING - 2);

    const accentColor = getComputedStyle(canvas).getPropertyValue("--accent").trim() || "#1db954";
    const { outgoing, incoming } = getPoints();

    // Draw curves
    drawBezierCurve(ctx, outgoing, width, height, "rgba(255,255,255,0.7)", PADDING);
    drawBezierCurve(ctx, incoming, width, height, accentColor, PADDING);

    // Draw handles and points
    drawHandles(ctx, outgoing, width, height, "rgba(255,255,255,0.3)", "white", PADDING);
    drawHandles(ctx, incoming, width, height, `${accentColor}66`, accentColor, PADDING);
  }, [waveformA, waveformB, style, customCurves, loading, height, getPoints, selectedTarget]);

  // --- Mouse interaction ---
  const getCanvasCoords = useCallback((e: React.MouseEvent): { x: number; y: number } => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const { x, y } = getCanvasCoords(e);
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const width = rect.width;
    const { outgoing, incoming } = getPoints();

    const hit = hitTest(x, y, outgoing, incoming, width, height, PADDING);
    if (hit) {
      setSelectedTarget(hit);
      draggingRef.current = hit;
    } else {
      setSelectedTarget(null);
    }
  }, [getCanvasCoords, getPoints, height]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const drag = draggingRef.current;
    if (!drag) return;

    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const width = rect.width;
    const { x: canvasX, y: canvasY } = getCanvasCoords(e);

    const drawW = width - PADDING * 2;
    const drawH = height - PADDING * 2;
    const normX = (canvasX - PADDING) / drawW;
    const normY = 1 - (canvasY - PADDING) / drawH;

    const { outgoing, incoming } = getPoints();
    const points = drag.curveId === "outgoing" ? [...outgoing] : [...incoming];

    if (drag.type === "point") {
      const idx = drag.index;
      const isEndpoint = idx === 0 || idx === points.length - 1;
      const p = { ...points[idx] };

      if (!isEndpoint) {
        const prevX = points[idx - 1].x;
        const nextX = points[idx + 1].x;
        p.x = clampPointX(normX, prevX, nextX);
      }
      p.y = Math.max(0, Math.min(1, normY));
      points[idx] = p;
    } else if (drag.type === "handleOut") {
      const p = { ...points[drag.index] };
      const rawOffset = { x: normX - p.x, y: normY - p.y };
      p.handleOut = clampHandle(rawOffset, "out");
      points[drag.index] = p;
    } else if (drag.type === "handleIn") {
      const p = { ...points[drag.index] };
      const rawOffset = { x: normX - p.x, y: normY - p.y };
      p.handleIn = clampHandle(rawOffset, "in");
      points[drag.index] = p;
    }

    const newCurves: CustomCurves = drag.curveId === "outgoing"
      ? { outgoing: points, incoming: customCurves?.incoming ?? presetToPoints(style, false) }
      : { outgoing: customCurves?.outgoing ?? presetToPoints(style, true), incoming: points };

    onChange(newCurves);
  }, [getCanvasCoords, getPoints, height, onChange, customCurves, style]);

  const handleMouseUp = useCallback(() => {
    draggingRef.current = null;
  }, []);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    const { x, y } = getCanvasCoords(e);
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const width = rect.width;
    const { outgoing, incoming } = getPoints();

    const hit = hitTest(x, y, outgoing, incoming, width, height, PADDING);
    if (!hit) return;

    if (hit.type === "point") {
      // Delete point (unless it's an endpoint)
      const points = hit.curveId === "outgoing" ? [...outgoing] : [...incoming];
      if (hit.index === 0 || hit.index === points.length - 1) return;
      points.splice(hit.index, 1);

      const newCurves: CustomCurves = hit.curveId === "outgoing"
        ? { outgoing: points, incoming: customCurves?.incoming ?? presetToPoints(style, false) }
        : { outgoing: customCurves?.outgoing ?? presetToPoints(style, true), incoming: points };
      onChange(newCurves);
      setSelectedTarget(null);
    } else if (hit.type === "curve") {
      // Add point on curve
      const points = hit.curveId === "outgoing" ? [...outgoing] : [...incoming];
      if (points.length >= MAX_POINTS) return;

      // Find insertion index
      let insertIdx = 1;
      for (let i = 0; i < points.length - 1; i++) {
        if (hit.x >= points[i].x && hit.x <= points[i + 1].x) {
          insertIdx = i + 1;
          break;
        }
      }

      const newPoint = createPoint(hit.x, hit.y, points[insertIdx - 1], points[insertIdx]);
      points.splice(insertIdx, 0, newPoint);

      const newCurves: CustomCurves = hit.curveId === "outgoing"
        ? { outgoing: points, incoming: customCurves?.incoming ?? presetToPoints(style, false) }
        : { outgoing: customCurves?.outgoing ?? presetToPoints(style, true), incoming: points };
      onChange(newCurves);
    }
  }, [getCanvasCoords, getPoints, height, onChange, customCurves, style]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.key === "Delete" || e.key === "Backspace") && selectedTarget?.type === "point") {
      const { outgoing, incoming } = getPoints();
      const points = selectedTarget.curveId === "outgoing" ? [...outgoing] : [...incoming];
      if (selectedTarget.index === 0 || selectedTarget.index === points.length - 1) return;
      points.splice(selectedTarget.index, 1);

      const newCurves: CustomCurves = selectedTarget.curveId === "outgoing"
        ? { outgoing: points, incoming: customCurves?.incoming ?? presetToPoints(style, false) }
        : { outgoing: customCurves?.outgoing ?? presetToPoints(style, true), incoming: points };
      onChange(newCurves);
      setSelectedTarget(null);
    }
  }, [selectedTarget, getPoints, onChange, customCurves, style]);

  return (
    <canvas
      ref={canvasRef}
      className="curve-editor-canvas"
      tabIndex={0}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onDoubleClick={handleDoubleClick}
      onKeyDown={handleKeyDown}
    />
  );
}

// --- Drawing helpers (module-level, not exported) ---

function drawWaveformBars(
  ctx: CanvasRenderingContext2D,
  data: number[],
  x: number,
  w: number,
  h: number,
  color: string,
) {
  if (data.length === 0) return;
  const barWidth = w / data.length;
  ctx.fillStyle = color;
  for (let i = 0; i < data.length; i++) {
    const barH = data[i] * h * 0.8;
    const bx = x + i * barWidth;
    const by = h / 2 - barH / 2;
    ctx.fillRect(bx, by, Math.max(barWidth - 1, 1), Math.max(barH, 1));
  }
}

function drawBezierCurve(
  ctx: CanvasRenderingContext2D,
  points: CurvePoint[],
  canvasWidth: number,
  canvasHeight: number,
  color: string,
  padding: number,
) {
  const drawW = canvasWidth - padding * 2;
  const drawH = canvasHeight - padding * 2;
  const toX = (nx: number) => padding + nx * drawW;
  const toY = (ny: number) => padding + (1 - ny) * drawH;

  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.beginPath();

  // Draw each segment as a cubic bezier
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p3 = points[i + 1];
    const c1x = toX(p0.x + p0.handleOut.x);
    const c1y = toY(p0.y + p0.handleOut.y);
    const c2x = toX(p3.x + p3.handleIn.x);
    const c2y = toY(p3.y + p3.handleIn.y);

    if (i === 0) {
      ctx.moveTo(toX(p0.x), toY(p0.y));
    }
    ctx.bezierCurveTo(c1x, c1y, c2x, c2y, toX(p3.x), toY(p3.y));
  }
  ctx.stroke();
}

function drawHandles(
  ctx: CanvasRenderingContext2D,
  points: CurvePoint[],
  canvasWidth: number,
  canvasHeight: number,
  handleColor: string,
  pointColor: string,
  padding: number,
) {
  const drawW = canvasWidth - padding * 2;
  const drawH = canvasHeight - padding * 2;
  const toX = (nx: number) => padding + nx * drawW;
  const toY = (ny: number) => padding + (1 - ny) * drawH;

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const px = toX(p.x);
    const py = toY(p.y);

    // Draw handle lines and circles
    if (i < points.length - 1) {
      const hx = toX(p.x + p.handleOut.x);
      const hy = toY(p.y + p.handleOut.y);
      ctx.strokeStyle = handleColor;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(hx, hy);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.beginPath();
      ctx.arc(hx, hy, 4, 0, Math.PI * 2);
      ctx.fillStyle = handleColor;
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.3)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    if (i > 0) {
      const hx = toX(p.x + p.handleIn.x);
      const hy = toY(p.y + p.handleIn.y);
      ctx.strokeStyle = handleColor;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(hx, hy);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.beginPath();
      ctx.arc(hx, hy, 4, 0, Math.PI * 2);
      ctx.fillStyle = handleColor;
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.3)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Draw main point
    ctx.beginPath();
    ctx.arc(px, py, 6, 0, Math.PI * 2);
    ctx.fillStyle = pointColor;
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.4)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}
