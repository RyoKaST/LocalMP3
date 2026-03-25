import { useState, useRef, useCallback } from "react";
import {
  EQ_BANDS,
  SIMPLE_BANDS,
  EQ_PRESETS,
} from "../hooks/useEqualizer";

interface EqualizerProps {
  gains: number[];
  preamp: number;
  preset: string;
  enabled: boolean;
  perTrack: boolean;
  onBandChange: (index: number, value: number) => void;
  onPresetChange: (name: string) => void;
  onPreampChange: (value: number) => void;
  onEnabledChange: (enabled: boolean) => void;
  onPerTrackChange: (perTrack: boolean) => void;
}

function EqSlider({ value, onChange, label, dbLabel }: {
  value: number;
  onChange: (v: number) => void;
  label: string;
  dbLabel: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const valueToPercent = (v: number) => ((v + 12) / 24) * 100;
  const percentToValue = (p: number) => Math.round(((p / 100) * 24 - 12) * 2) / 2;

  const handleDrag = useCallback((clientY: number) => {
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const pct = Math.max(0, Math.min(100, ((rect.bottom - clientY) / rect.height) * 100));
    onChange(percentToValue(pct));
  }, [onChange]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    handleDrag(e.clientY);
    const onMove = (ev: MouseEvent) => { if (dragging.current) handleDrag(ev.clientY); };
    const onUp = () => { dragging.current = false; window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [handleDrag]);

  const pct = valueToPercent(value);

  return (
    <div className="eq-band">
      <span className="eq-band-db">{dbLabel}</span>
      <div className="eq-band-track" ref={trackRef} onMouseDown={onMouseDown}>
        <div className="eq-band-center" />
        <div
          className="eq-band-fill"
          style={value >= 0
            ? { bottom: "50%", height: `${(value / 12) * 50}%` }
            : { top: "50%", height: `${(-value / 12) * 50}%` }
          }
        />
        <div className="eq-band-thumb" style={{ bottom: `${pct}%` }} />
      </div>
      <span className="eq-band-label">{label}</span>
    </div>
  );
}

export default function Equalizer({
  gains,
  preamp,
  preset,
  enabled,
  perTrack,
  onBandChange,
  onPresetChange,
  onPreampChange,
  onEnabledChange,
  onPerTrackChange,
}: EqualizerProps) {
  const [advanced, setAdvanced] = useState(false);

  function getSimpleValue(indices: number[]) {
    return indices.reduce((sum, i) => sum + gains[i], 0) / indices.length;
  }

  function setSimpleValue(indices: number[], value: number) {
    indices.forEach((i) => onBandChange(i, value));
  }

  function formatFreq(hz: number) {
    return hz >= 1000 ? `${hz / 1000}k` : `${hz}`;
  }

  function formatDb(v: number) {
    return `${v > 0 ? "+" : ""}${v.toFixed(1)}`;
  }

  return (
    <div className="eq-container">
      <div className="eq-header">
        <h2 className="eq-title">Equalizer</h2>
        <div className="eq-header-controls">
          <label className="eq-toggle" onClick={() => onEnabledChange(!enabled)}>
            <div className={`settings-toggle-switch${enabled ? " active" : ""}`}>
              <span className="settings-toggle-knob" />
            </div>
          </label>
        </div>
      </div>

      <div className={`eq-body${enabled ? "" : " disabled"}`}>
        <div className="eq-top-row">
          <button
            className={`eq-mode-btn${advanced ? " active" : ""}`}
            onClick={() => setAdvanced((a) => !a)}
          >
            {advanced ? "Simple" : "Advanced"}
          </button>
          <label className="eq-per-track" onClick={() => onPerTrackChange(!perTrack)}>
            <div className={`settings-toggle-switch small${perTrack ? " active" : ""}`}>
              <span className="settings-toggle-knob" />
            </div>
            <span className="eq-per-track-label">Per-track</span>
          </label>
        </div>

        <div className="eq-presets-grid">
          {EQ_PRESETS.map((p) => (
            <button
              key={p.name}
              className={`eq-preset-chip${preset === p.name ? " active" : ""}`}
              onClick={() => onPresetChange(p.name)}
            >
              {p.name}
            </button>
          ))}
          {preset === "Custom" && (
            <button className="eq-preset-chip active" disabled>
              Custom
            </button>
          )}
        </div>

        <div className="eq-preamp">
          <span className="eq-preamp-label">Preamp</span>
          <input
            type="range"
            min={-12}
            max={12}
            step={0.5}
            value={preamp}
            onChange={(e) => onPreampChange(parseFloat(e.target.value))}
            className="eq-slider eq-preamp-slider"
          />
          <span className="eq-db">{preamp > 0 ? "+" : ""}{preamp.toFixed(1)} dB</span>
        </div>

        <div className="eq-visualizer">
          <div className="eq-scale">
            <span>+12</span>
            <span>+6</span>
            <span>0 dB</span>
            <span>-6</span>
            <span>-12</span>
          </div>

          <div className="eq-bands">
            {advanced ? (
              EQ_BANDS.map((freq, i) => (
                <EqSlider
                  key={freq}
                  value={gains[i]}
                  onChange={(v) => onBandChange(i, v)}
                  label={formatFreq(freq)}
                  dbLabel={formatDb(gains[i])}
                />
              ))
            ) : (
              SIMPLE_BANDS.map((band) => (
                <EqSlider
                  key={band.label}
                  value={getSimpleValue(band.indices)}
                  onChange={(v) => setSimpleValue(band.indices, v)}
                  label={band.label}
                  dbLabel={formatDb(getSimpleValue(band.indices))}
                />
              ))
            )}
          </div>
        </div>

        <button className="eq-reset-btn" onClick={() => onPresetChange("Flat")}>
          Reset
        </button>
      </div>
    </div>
  );
}
