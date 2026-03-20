import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { LrcLine } from "../types";

interface LyricsProps {
  lrcPath: string;
  trackPath: string;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  onChangeLrc: () => void;
  onUnlinkLrc: () => void;
  onClose: () => void;
}

export default function Lyrics({ lrcPath, trackPath, audioRef, onChangeLrc, onUnlinkLrc, onClose }: LyricsProps) {
  const [lines, setLines] = useState<LrcLine[]>([]);
  const [currentLine, setCurrentLine] = useState(-1);
  const [speed, setSpeed] = useState(1);
  const speedRef = useRef(1);
  const containerRef = useRef<HTMLDivElement>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    invoke<LrcLine[]>("read_lrc", { lrcPath })
      .then(setLines)
      .catch(() => setLines([]));
  }, [lrcPath]);

  // Load saved speed when track changes
  useEffect(() => {
    invoke<number>("get_lrc_speed", { trackPath }).then((s) => {
      setSpeed(s);
      speedRef.current = s;
    });
  }, [trackPath]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || lines.length === 0) return;

    let rafId: number;
    let lastIdx = -1;
    // Lookahead offset: show lyrics slightly ahead of the timestamp
    // to compensate for audio buffering and natural reading delay
    const LOOKAHEAD = 0.3;

    function tick() {
      const t = audio!.currentTime * speedRef.current + LOOKAHEAD;
      let idx = -1;
      for (let i = lines.length - 1; i >= 0; i--) {
        if (t >= lines[i].time) {
          idx = i;
          break;
        }
      }
      if (idx !== lastIdx) {
        lastIdx = idx;
        setCurrentLine(idx);
      }
      rafId = requestAnimationFrame(tick);
    }

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [audioRef, lines]);

  useEffect(() => {
    if (currentLine < 0 || !containerRef.current) return;
    const el = containerRef.current.querySelector(".lyrics-line.active");
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [currentLine]);

  return (
    <div className="lyrics-panel">
      <div className="lyrics-header">
        <span className="lyrics-title">Lyrics</span>
        <div className="lyrics-actions">
          <button className="lyrics-action-btn" onClick={onChangeLrc} title="Change LRC file">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
              <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
            </svg>
          </button>
          <button className="lyrics-action-btn lyrics-action-danger" onClick={onUnlinkLrc} title="Unlink lyrics">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
              <path d="M17 7h-4v2h4c1.65 0 3 1.35 3 3s-1.35 3-3 3h-4v2h4c2.76 0 5-2.24 5-5s-2.24-5-5-5zm-6 8H7c-1.65 0-3-1.35-3-3s1.35-3 3-3h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-2z" />
              <path d="M1 21l22-22" stroke="currentColor" strokeWidth="2" />
            </svg>
          </button>
          <button className="lyrics-action-btn" onClick={onClose} title="Close">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            </svg>
          </button>
        </div>
      </div>
      <div className="lyrics-speed">
        <span className="lyrics-speed-label">Speed</span>
        <input
          type="range"
          min="0.5"
          max="2"
          step="0.05"
          value={speed}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            setSpeed(v);
            speedRef.current = v;
            // Debounce save to avoid spamming during drag
            if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
            saveTimeoutRef.current = setTimeout(() => {
              invoke("set_lrc_speed", { trackPath, speed: v });
            }, 300);
          }}
          className="lyrics-speed-slider"
        />
        <span className="lyrics-speed-value">{speed.toFixed(2)}x</span>
        {speed !== 1 && (
          <button
            className="lyrics-speed-reset"
            onClick={() => {
              setSpeed(1);
              speedRef.current = 1;
              invoke("set_lrc_speed", { trackPath, speed: 1.0 });
            }}
          >
            Reset
          </button>
        )}
      </div>
      <div className="lyrics-content" ref={containerRef}>
        {lines.length === 0 ? (
          <div className="lyrics-empty">Could not parse lyrics</div>
        ) : (
          lines.map((line, i) => (
            <div
              key={i}
              className={`lyrics-line${i === currentLine ? " active" : ""}`}
              onClick={() => {
                const audio = audioRef.current;
                if (audio) audio.currentTime = line.time / speedRef.current;
              }}
            >
              {line.text}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
