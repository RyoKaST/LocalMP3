import { useState, useEffect, useRef, useCallback } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Track } from "../types";
import { useLyricsSync } from "../hooks/useLyricsSync";
import { extractDominantColors } from "../utils/colorExtract";

export type FullscreenLayout = "side-by-side" | "cover" | "karaoke";
export type FullscreenBackground = "blurred-cover" | "color-gradient" | "dark-accent";
export type FullscreenControls = "full" | "minimal" | "auto-hide";

interface FullscreenPlayerProps {
  currentTrack: Track;
  isPlaying: boolean;
  shuffle: boolean;
  repeat: "off" | "all" | "one";
  audioRef: React.RefObject<HTMLAudioElement | null>;
  onPlayPause: () => void;
  onNext: () => void;
  onPrev: () => void;
  onShuffleToggle: () => void;
  onRepeatCycle: () => void;
  onClose: () => void;
}

function formatTime(secs: number): string {
  if (isNaN(secs)) return "0:00";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function FullscreenPlayer({
  currentTrack,
  isPlaying,
  shuffle,
  repeat,
  audioRef,
  onPlayPause,
  onNext,
  onPrev,
  onShuffleToggle,
  onRepeatCycle,
  onClose,
}: FullscreenPlayerProps) {
  const [layout, setLayout] = useState<FullscreenLayout>(() =>
    (localStorage.getItem("fullscreenLayout") as FullscreenLayout) || "side-by-side"
  );
  const [background, setBackground] = useState<FullscreenBackground>(() =>
    (localStorage.getItem("fullscreenBackground") as FullscreenBackground) || "blurred-cover"
  );
  const [controlsMode, setControlsMode] = useState<FullscreenControls>(() =>
    (localStorage.getItem("fullscreenControls") as FullscreenControls) || "auto-hide"
  );

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(() => audioRef.current?.volume ?? 1);
  const [seekValue, setSeekValue] = useState(0);
  const isSeeking = useRef(false);

  const [isEntering, setIsEntering] = useState(true);
  const [isClosing, setIsClosing] = useState(false);

  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [gradientColors, setGradientColors] = useState<string[]>([]);

  const lyricsContainerRef = useRef<HTMLDivElement>(null);
  const hasLyrics = !!currentTrack.lrc_path;
  const { lines, currentLine, seekToLine } = useLyricsSync({
    lrcPath: currentTrack.lrc_path,
    trackPath: currentTrack.path,
    audioRef,
    enabled: hasLyrics,
  });

  const coverUrl = currentTrack.cover ? convertFileSrc(currentTrack.cover) : null;

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      setIsEntering(false);
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    setCurrentTime(audio.currentTime);
    setDuration(audio.duration || 0);
    setSeekValue(audio.currentTime);
    setVolume(audio.volume);

    const onTimeUpdate = () => {
      if (!isSeeking.current) {
        setCurrentTime(audio.currentTime);
        setSeekValue(audio.currentTime);
      }
    };
    const onDurationChange = () => setDuration(audio.duration);

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("durationchange", onDurationChange);

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("durationchange", onDurationChange);
    };
  }, [audioRef]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleClose();
      }
      if (controlsMode === "auto-hide") {
        showControls();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [controlsMode]);

  const showControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      setControlsVisible(false);
    }, 3000);
  }, []);

  useEffect(() => {
    if (controlsMode !== "auto-hide") {
      setControlsVisible(true);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      return;
    }
    showControls();
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [controlsMode, showControls]);

  const handleMouseMove = useCallback(() => {
    if (controlsMode === "auto-hide") {
      showControls();
    }
  }, [controlsMode, showControls]);

  useEffect(() => {
    if (background === "color-gradient" && coverUrl) {
      extractDominantColors(coverUrl).then(setGradientColors);
    }
  }, [background, coverUrl]);

  useEffect(() => {
    if (currentLine < 0 || !lyricsContainerRef.current) return;
    const container = lyricsContainerRef.current;
    const inner = container.querySelector(".fs-lyrics-inner") as HTMLElement | null;
    const activeLine = container.querySelector(".fs-lyrics-line.active") as HTMLElement | null;
    if (!inner || !activeLine) return;
    const containerHeight = container.clientHeight;
    const lineTop = activeLine.offsetTop;
    const lineHeight = activeLine.offsetHeight;
    const offset = lineTop - containerHeight / 2 + lineHeight / 2;
    inner.style.transform = `translateY(${-offset}px)`;
  }, [currentLine]);

  useEffect(() => {
    const handleStorage = () => {
      setLayout((localStorage.getItem("fullscreenLayout") as FullscreenLayout) || "side-by-side");
      setBackground((localStorage.getItem("fullscreenBackground") as FullscreenBackground) || "blurred-cover");
      setControlsMode((localStorage.getItem("fullscreenControls") as FullscreenControls) || "auto-hide");
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const handleSeekStart = useCallback(() => {
    isSeeking.current = true;
  }, []);

  const handleSeekChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setSeekValue(val);
    setCurrentTime(val);
  }, []);

  const handleSeekEnd = useCallback(() => {
    if (audioRef.current) audioRef.current.currentTime = seekValue;
    isSeeking.current = false;
  }, [audioRef, seekValue]);

  const handleVolumeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = parseFloat(e.target.value);
      setVolume(v);
      if (audioRef.current) audioRef.current.volume = v;
    },
    [audioRef],
  );

  const handleClose = useCallback(() => {
    if (isClosing) return;
    setIsClosing(true);
  }, [isClosing]);

  const handleTransitionEnd = useCallback(() => {
    if (isClosing) {
      onClose();
    }
  }, [isClosing, onClose]);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const isMinimal = controlsMode === "minimal";
  const shouldHideControls = controlsMode === "auto-hide" && !controlsVisible;

  const renderBackground = () => {
    if (background === "blurred-cover") {
      return (
        <div className="fs-bg fs-bg-blur">
          {coverUrl && (
            <img className="fs-bg-blur-img" src={coverUrl} alt="" />
          )}
          <div className="fs-bg-overlay" />
        </div>
      );
    }
    if (background === "color-gradient") {
      const colors = gradientColors.length >= 2 ? gradientColors : ["#1a1a2e", "#16213e", "#0f3460"];
      const gradientStyle = {
        background: `linear-gradient(135deg, ${colors.join(", ")})`,
      };
      return <div className="fs-bg fs-bg-gradient" style={gradientStyle} />;
    }
    return <div className="fs-bg fs-bg-dark" />;
  };

  const renderCover = (sizeClass: string) => {
    if (coverUrl) {
      return (
        <div className={`fs-cover ${sizeClass}`}>
          <img src={coverUrl} alt={currentTrack.title} />
        </div>
      );
    }
    return (
      <div className={`fs-cover-placeholder ${sizeClass}`}>
        <svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor">
          <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55C7.79 13 6 14.79 6 17s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
        </svg>
      </div>
    );
  };

  const renderLyrics = (className: string) => {
    if (!hasLyrics || lines.length === 0) return null;
    return (
      <div className={`fs-lyrics ${className}`} ref={lyricsContainerRef}>
        <div className="fs-lyrics-inner">
          {lines.map((line, i) => (
            <div
              key={i}
              className={`fs-lyrics-line${i === currentLine ? " active" : ""}`}
              onClick={() => seekToLine(i)}
            >
              {line.text || "\u00A0"}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderTrackInfo = () => (
    <div className="fs-track-info">
      <div className="fs-track-title">{currentTrack.title}</div>
      <div className="fs-track-artist">{currentTrack.artist}</div>
    </div>
  );

  const renderContent = () => {
    if (layout === "side-by-side") {
      if (hasLyrics && lines.length > 0) {
        return (
          <div className="fs-layout-side-by-side">
            <div className="fs-cover-section">
              {renderCover("fs-cover-large")}
              {renderTrackInfo()}
            </div>
            {renderLyrics("fs-lyrics-side")}
          </div>
        );
      }
      return (
        <div className="fs-layout-centered">
          {renderCover("fs-cover-large")}
          {renderTrackInfo()}
        </div>
      );
    }

    if (layout === "cover") {
      return (
        <div className="fs-layout-centered">
          {renderCover("fs-cover-large")}
          {renderTrackInfo()}
          {renderLyrics("fs-lyrics-compact")}
        </div>
      );
    }

    if (hasLyrics && lines.length > 0) {
      return (
        <div className="fs-layout-karaoke">
          <div className="fs-karaoke-header">
            {renderCover("fs-cover-small")}
            {renderTrackInfo()}
          </div>
          {renderLyrics("fs-lyrics-karaoke")}
        </div>
      );
    }
    return (
      <div className="fs-layout-centered">
        {renderCover("fs-cover-large")}
        {renderTrackInfo()}
      </div>
    );
  };

  const renderControls = () => {
    return (
      <div className={`fs-controls${shouldHideControls ? " hidden" : ""}`}>
        <div className="fs-progress">
          <span className="fs-time">{formatTime(currentTime)}</span>
          <input
            type="range"
            min="0"
            max={duration || 0}
            step="0.1"
            value={seekValue}
            onMouseDown={handleSeekStart}
            onChange={handleSeekChange}
            onMouseUp={handleSeekEnd}
            className="fs-progress-slider"
            style={{ "--progress": `${progress}%` } as React.CSSProperties}
          />
          <span className="fs-time">{formatTime(duration)}</span>
        </div>

        <div className="fs-buttons">
          {!isMinimal && (
            <button
              className={`fs-btn fs-btn-mode${shuffle ? " active" : ""}`}
              onClick={onShuffleToggle}
              title="Shuffle"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                <path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z" />
              </svg>
            </button>
          )}

          <button className="fs-btn" onClick={onPrev}>
            <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
              <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
            </svg>
          </button>

          <button className="fs-btn fs-btn-play" onClick={onPlayPause}>
            {isPlaying ? (
              <svg viewBox="0 0 24 24" width="36" height="36" fill="currentColor">
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" width="36" height="36" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>

          <button className="fs-btn" onClick={onNext}>
            <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
              <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
            </svg>
          </button>

          {!isMinimal && (
            <button
              className={`fs-btn fs-btn-mode${repeat !== "off" ? " active" : ""}`}
              onClick={onRepeatCycle}
              title={repeat === "off" ? "Repeat off" : repeat === "all" ? "Repeat all" : "Repeat one"}
            >
              {repeat === "one" ? (
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                  <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4zm-4-2V9h-1l-2 1v1h1.5v4H13z" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                  <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z" />
                </svg>
              )}
            </button>
          )}
        </div>

        {!isMinimal && (
          <div className="fs-volume">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
              <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
            </svg>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={volume}
              onChange={handleVolumeChange}
              className="fs-volume-slider"
            />
          </div>
        )}
      </div>
    );
  };

  const overlayClass = [
    "fs-overlay",
    isEntering ? "fs-entering" : "",
    isClosing ? "fs-closing" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={overlayClass}
      onMouseMove={handleMouseMove}
      onTransitionEnd={handleTransitionEnd}
    >
      {renderBackground()}
      <div className="fs-content">
        {renderContent()}
      </div>
      {renderControls()}
    </div>
  );
}
