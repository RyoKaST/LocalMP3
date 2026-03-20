import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Track, TransitionPreset, TransitionStyle } from "../types";
import CurveEditor from "./CurveEditor";
import { presetToPoints } from "../audio/curveUtils";

interface TransitionCardProps {
  trackA: Track;
  trackB: Track;
  preset: TransitionPreset;
  useDefault: boolean;
  onPresetChange: (preset: TransitionPreset) => void;
  onUseDefaultChange: (useDefault: boolean) => void;
  onPreview: () => void;
  previewing: boolean;
}

const STYLE_OPTIONS: { value: TransitionStyle; label: string }[] = [
  { value: "fade", label: "Fade" },
  { value: "rise", label: "Rise" },
  { value: "cut", label: "Cut" },
  { value: "echo_out", label: "Echo Out" },
  { value: "custom", label: "Custom" },
];

export default function TransitionCard({
  trackA,
  trackB,
  preset,
  useDefault,
  onPresetChange,
  onUseDefaultChange,
  onPreview,
  previewing,
}: TransitionCardProps) {
  const [waveformA, setWaveformA] = useState<number[]>([]);
  const [waveformB, setWaveformB] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const dur = preset.style === "cut" ? 2 : preset.duration;

    Promise.all([
      invoke<number[]>("get_waveform", {
        path: trackA.path,
        startSec: Math.max(0, trackA.duration - dur),
        durationSec: dur,
        numSamples: 100,
      }),
      invoke<number[]>("get_waveform", {
        path: trackB.path,
        startSec: 0,
        durationSec: dur,
        numSamples: 100,
      }),
    ]).then(([a, b]) => {
      if (!cancelled) {
        setWaveformA(a);
        setWaveformB(b);
        setLoading(false);
      }
    }).catch(() => {
      if (!cancelled) {
        setWaveformA([]);
        setWaveformB([]);
        setLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, [trackA.path, trackB.path, preset.duration, preset.style]);

  return (
    <div className="transition-card">
      <CurveEditor
        waveformA={waveformA}
        waveformB={waveformB}
        style={preset.style}
        customCurves={preset.custom_curves ?? null}
        loading={loading}
        onChange={(curves) => {
          onPresetChange({
            ...preset,
            style: "custom",
            custom_curves: curves,
          });
        }}
      />
      <div className="transition-card-controls">
        <select
          className="transition-style-select"
          value={preset.style}
          disabled={useDefault}
          onChange={(e) => {
            const newStyle = e.target.value as TransitionStyle;
            if (newStyle === "custom") {
              const baseStyle = preset.style === "custom" ? "fade" : preset.style;
              onPresetChange({
                ...preset,
                style: "custom",
                custom_curves: {
                  outgoing: presetToPoints(baseStyle, true),
                  incoming: presetToPoints(baseStyle, false),
                },
              });
            } else {
              onPresetChange({ ...preset, style: newStyle, custom_curves: undefined });
            }
          }}
        >
          {STYLE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {preset.style !== "cut" && (
          <div className="transition-duration-control">
            <input
              type="range"
              min="1"
              max="12"
              step="0.5"
              value={preset.duration}
              disabled={useDefault}
              onChange={(e) =>
                onPresetChange({ ...preset, duration: parseFloat(e.target.value) })
              }
              className="transition-duration-slider"
            />
            <span className="transition-duration-label">{preset.duration}s</span>
          </div>
        )}
        <button
          className="transition-preview-btn"
          onClick={onPreview}
          disabled={previewing}
        >
          {previewing ? "Playing..." : "Preview"}
        </button>
        {preset.style === "custom" && (
          <div className="curve-reset-buttons">
            <button
              className="curve-reset-btn"
              onClick={() => {
                const current = preset.custom_curves;
                if (!current) return;
                onPresetChange({
                  ...preset,
                  custom_curves: {
                    ...current,
                    outgoing: presetToPoints("fade", true),
                  },
                });
              }}
            >
              Reset A
            </button>
            <button
              className="curve-reset-btn curve-reset-btn-b"
              onClick={() => {
                const current = preset.custom_curves;
                if (!current) return;
                onPresetChange({
                  ...preset,
                  custom_curves: {
                    ...current,
                    incoming: presetToPoints("fade", false),
                  },
                });
              }}
            >
              Reset B
            </button>
          </div>
        )}
      </div>
      <label className="transition-use-default">
        <input
          type="checkbox"
          checked={useDefault}
          onChange={(e) => onUseDefaultChange(e.target.checked)}
        />
        Use default
      </label>
    </div>
  );
}
