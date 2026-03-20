import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Track, Playlist, PlaylistMix, TransitionPreset, TransitionStyle } from "../types";
import { TransitionEngine } from "../audio/TransitionEngine";
import TransitionCard from "./TransitionCard";
import { presetToPoints } from "../audio/curveUtils";

interface MixModeProps {
  playlist: Playlist;
  engine: TransitionEngine | null;
  onExit: () => void;
  onMixSaved: (mix: PlaylistMix) => void;
}

const DEFAULT_PRESET: TransitionPreset = { style: "fade", duration: 4 };

function pairKey(a: Track, b: Track): string {
  return `${a.path}::${b.path}`;
}

export default function MixMode({ playlist, engine, onExit, onMixSaved }: MixModeProps) {
  const [mix, setMix] = useState<PlaylistMix>(() =>
    playlist.mix ?? {
      enabled: true,
      default_transition: { ...DEFAULT_PRESET },
      pair_overrides: {},
    }
  );
  const [previewing, setPreviewing] = useState<string | null>(null);

  // Save on every change, but skip the initial mount
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    invoke("save_playlist_mix", { playlistId: playlist.id, mix }).catch(console.error);
    onMixSaved(mix);
  }, [mix, playlist.id]);

  const handleDefaultChange = useCallback((preset: TransitionPreset) => {
    setMix((m) => ({ ...m, default_transition: preset }));
  }, []);

  const handlePairPresetChange = useCallback((key: string, preset: TransitionPreset) => {
    setMix((m) => ({
      ...m,
      pair_overrides: { ...m.pair_overrides, [key]: preset },
    }));
  }, []);

  const handleUseDefaultChange = useCallback((key: string, useDefault: boolean) => {
    setMix((m) => {
      const overrides = { ...m.pair_overrides };
      if (useDefault) {
        delete overrides[key];
      } else {
        overrides[key] = { ...m.default_transition };
      }
      return { ...m, pair_overrides: overrides };
    });
  }, []);

  const handlePreview = useCallback(async (trackA: Track, trackB: Track, preset: TransitionPreset, key: string) => {
    if (!engine) return;
    setPreviewing(key);
    try {
      await engine.preview(trackA, trackB, preset);
    } catch (e) {
      console.error("Preview failed:", e);
    }
    setPreviewing(null);
  }, [engine]);

  const tracks = playlist.tracks;

  return (
    <div className="mix-mode">
      <div className="mix-mode-header">
        <button className="mix-mode-back" onClick={onExit}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
          </svg>
        </button>
        <h2 className="mix-mode-title">{playlist.name} — Mix</h2>
        <div className="mix-mode-global">
          <select
            className="transition-style-select"
            value={mix.default_transition.style}
            onChange={(e) => {
              const newStyle = e.target.value as TransitionStyle;
              if (newStyle === "custom") {
                const baseStyle = mix.default_transition.style === "custom" ? "fade" : mix.default_transition.style;
                handleDefaultChange({
                  ...mix.default_transition,
                  style: "custom",
                  custom_curves: {
                    outgoing: presetToPoints(baseStyle, true),
                    incoming: presetToPoints(baseStyle, false),
                  },
                });
              } else {
                handleDefaultChange({ ...mix.default_transition, style: newStyle, custom_curves: undefined });
              }
            }}
          >
            <option value="fade">Fade</option>
            <option value="rise">Rise</option>
            <option value="cut">Cut</option>
            <option value="echo_out">Echo Out</option>
            <option value="custom">Custom</option>
          </select>
          {mix.default_transition.style !== "cut" && (
            <div className="transition-duration-control">
              <input
                type="range"
                min="1"
                max="12"
                step="0.5"
                value={mix.default_transition.duration}
                onChange={(e) =>
                  handleDefaultChange({ ...mix.default_transition, duration: parseFloat(e.target.value) })
                }
                className="transition-duration-slider"
              />
              <span className="transition-duration-label">{mix.default_transition.duration}s</span>
            </div>
          )}
          <label className="mix-mode-toggle">
            <input
              type="checkbox"
              checked={mix.enabled}
              onChange={(e) => setMix((m) => ({ ...m, enabled: e.target.checked }))}
            />
            Enabled
          </label>
        </div>
      </div>

      <div className="mix-mode-timeline">
        {tracks.map((track, i) => {
          const nextTrack = tracks[i + 1];
          const key = nextTrack ? pairKey(track, nextTrack) : null;
          const hasOverride = key ? key in mix.pair_overrides : false;
          const preset = key && hasOverride ? mix.pair_overrides[key] : mix.default_transition;

          return (
            <div key={track.path}>
              <div className="mix-mode-track">
                <span className="mix-mode-track-num">{i + 1}</span>
                <span className="mix-mode-track-title">{track.title}</span>
                <span className="mix-mode-track-artist">{track.artist}</span>
              </div>
              {nextTrack && key && (
                <TransitionCard
                  trackA={track}
                  trackB={nextTrack}
                  preset={preset}
                  useDefault={!hasOverride}
                  onPresetChange={(p) => handlePairPresetChange(key, p)}
                  onUseDefaultChange={(d) => handleUseDefaultChange(key, d)}
                  onPreview={() => handlePreview(track, nextTrack, preset, key)}
                  previewing={previewing === key}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
