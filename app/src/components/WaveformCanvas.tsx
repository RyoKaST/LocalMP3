import { useRef, useEffect } from "react";
import { TransitionStyle } from "../types";

interface WaveformCanvasProps {
  waveformA: number[];
  waveformB: number[];
  style: TransitionStyle;
  loading: boolean;
  height?: number;
}

function drawWaveform(
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

function drawVolumeCurve(
  ctx: CanvasRenderingContext2D,
  style: TransitionStyle,
  x: number,
  w: number,
  h: number,
  isOutgoing: boolean,
  accentColor: string,
) {
  ctx.strokeStyle = isOutgoing ? "rgba(255,255,255,0.6)" : accentColor;
  ctx.lineWidth = 2;
  ctx.beginPath();

  const steps = 100;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    let gain: number;

    switch (style) {
      case "fade":
        gain = isOutgoing ? 1 - t : t;
        break;
      case "rise":
        gain = isOutgoing ? Math.max(0.001, Math.pow(1 - t, 3)) : Math.pow(t, 2);
        break;
      case "cut":
        gain = isOutgoing ? (t < 0.5 ? 1 : 0) : (t < 0.5 ? 0 : 1);
        break;
      case "echo_out":
        gain = isOutgoing ? 1 - t : t;
        break;
      default:
        gain = isOutgoing ? 1 - t : t;
    }

    const px = x + t * w;
    const py = h - gain * h * 0.9 - h * 0.05;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();
}

export default function WaveformCanvas({
  waveformA,
  waveformB,
  style,
  loading,
  height = 80,
}: WaveformCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Measure actual rendered width so the canvas fills its container
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

    const halfW = width / 2 - 2;

    drawWaveform(ctx, waveformA, 0, halfW, height, "rgba(255,255,255,0.15)");
    drawWaveform(ctx, waveformB, halfW + 4, halfW, height, "rgba(255,255,255,0.15)");

    ctx.strokeStyle = "rgba(255,255,255,0.2)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(halfW + 2, 0);
    ctx.lineTo(halfW + 2, height);
    ctx.stroke();

    const accentColor = getComputedStyle(canvas).getPropertyValue("--accent").trim() || "#1db954";

    drawVolumeCurve(ctx, style, 0, width, height, true, accentColor);
    drawVolumeCurve(ctx, style, 0, width, height, false, accentColor);
  }, [waveformA, waveformB, style, loading, height]);

  return (
    <canvas
      ref={canvasRef}
      className="waveform-canvas"
    />
  );
}
