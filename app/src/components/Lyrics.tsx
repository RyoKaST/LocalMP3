import { useEffect, useRef } from "react";
import { useLyricsSync } from "../hooks/useLyricsSync";

interface LyricsProps {
  lrcPath: string;
  trackPath: string;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  closeOnClickOutside: boolean;
  onChangeLrc: () => void;
  onUnlinkLrc: () => void;
  onClose: () => void;
}

export default function Lyrics({ lrcPath, trackPath, audioRef, closeOnClickOutside, onChangeLrc, onUnlinkLrc, onClose }: LyricsProps) {
  const { lines, currentLine, speed, setSpeed, resetSpeed, seekToLine } = useLyricsSync({
    lrcPath,
    trackPath,
    audioRef,
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (currentLine < 0 || !containerRef.current) return;
    const el = containerRef.current.querySelector(".lyrics-line.active");
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [currentLine]);

  useEffect(() => {
    if (!closeOnClickOutside) return;
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        // Don't close if clicking the lyrics toggle button in the player
        const target = e.target as HTMLElement;
        if (target.closest("[data-lyrics-toggle]")) return;
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [closeOnClickOutside, onClose]);

  return (
    <div className="lyrics-panel" ref={panelRef}>
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
          onChange={(e) => setSpeed(parseFloat(e.target.value))}
          className="lyrics-speed-slider"
        />
        <span className="lyrics-speed-value">{speed.toFixed(2)}x</span>
        {speed !== 1 && (
          <button
            className="lyrics-speed-reset"
            onClick={resetSpeed}
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
              onClick={() => seekToLine(i)}
            >
              {line.text}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
