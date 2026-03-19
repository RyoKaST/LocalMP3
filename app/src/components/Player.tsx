import { useRef, useEffect, useState, useCallback } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Track } from "../types";

interface PlayerProps {
  currentTrack: Track | null;
  isPlaying: boolean;
  queue: Track[];
  queueIndex: number;
  shuffle: boolean;
  repeat: "off" | "all" | "one";
  onPlayPause: () => void;
  onNext: () => void;
  onPrev: () => void;
  onTrackEnd: () => void;
  onShuffleToggle: () => void;
  onRepeatCycle: () => void;
  hasLrc: boolean;
  lyricsVisible: boolean;
  onLyricsToggle: () => void;
  audioRef: React.RefObject<HTMLAudioElement | null>;
}

function formatTime(secs: number): string {
  if (isNaN(secs)) return "0:00";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function Player({
  currentTrack,
  isPlaying,
  queue,
  queueIndex,
  shuffle,
  repeat,
  onPlayPause,
  onNext,
  onPrev,
  onTrackEnd,
  onShuffleToggle,
  onRepeatCycle,
  hasLrc,
  lyricsVisible,
  onLyricsToggle,
  audioRef,
}: PlayerProps) {
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const progressRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onDurationChange = () => setDuration(audio.duration);
    const onEnded = () => onTrackEnd();

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("durationchange", onDurationChange);
    audio.addEventListener("ended", onEnded);

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("durationchange", onDurationChange);
      audio.removeEventListener("ended", onEnded);
    };
  }, [audioRef, onTrackEnd]);

  const handleProgressClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const audio = audioRef.current;
      const bar = progressRef.current;
      if (!audio || !bar) return;
      const rect = bar.getBoundingClientRect();
      const ratio = (e.clientX - rect.left) / rect.width;
      audio.currentTime = ratio * audio.duration;
    },
    [audioRef],
  );

  const handleVolumeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = parseFloat(e.target.value);
      setVolume(v);
      if (audioRef.current) audioRef.current.volume = v;
    },
    [audioRef],
  );

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="player">
      <div className="player-track-info">
        {currentTrack ? (
          <>
            <div className="player-cover">
              {currentTrack.cover ? (
                <img src={convertFileSrc(currentTrack.cover)} alt="" />
              ) : (
                <div className="player-cover-placeholder">
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                    <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55C7.79 13 6 14.79 6 17s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                  </svg>
                </div>
              )}
            </div>
            <div className="player-track-text">
              <div className="player-track-name">{currentTrack.title}</div>
              <div className="player-track-artist">{currentTrack.artist}</div>
            </div>
          </>
        ) : (
          <div className="player-track-name player-empty">
            No track selected
          </div>
        )}
      </div>

      <div className="player-controls">
        <div className="player-buttons">
          <button
            className={`player-btn player-btn-mode${shuffle ? " active" : ""}`}
            onClick={onShuffleToggle}
            title="Shuffle"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
              <path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z" />
            </svg>
          </button>
          <button
            className="player-btn"
            onClick={onPrev}
            disabled={queueIndex <= 0 && repeat !== "all"}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
            </svg>
          </button>
          <button
            className="player-btn player-btn-play"
            onClick={onPlayPause}
            disabled={!currentTrack}
          >
            {isPlaying ? (
              <svg
                viewBox="0 0 24 24"
                width="28"
                height="28"
                fill="currentColor"
              >
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
              </svg>
            ) : (
              <svg
                viewBox="0 0 24 24"
                width="28"
                height="28"
                fill="currentColor"
              >
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>
          <button
            className="player-btn"
            onClick={onNext}
            disabled={queueIndex >= queue.length - 1 && repeat !== "all" && !shuffle}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
            </svg>
          </button>
          <button
            className={`player-btn player-btn-mode${repeat !== "off" ? " active" : ""}`}
            onClick={onRepeatCycle}
            title={repeat === "off" ? "Repeat off" : repeat === "all" ? "Repeat all" : "Repeat one"}
          >
            {repeat === "one" ? (
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4zm-4-2V9h-1l-2 1v1h1.5v4H13z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z" />
              </svg>
            )}
          </button>
        </div>

        <div className="player-progress-container">
          <span className="player-time">{formatTime(currentTime)}</span>
          <div
            className="player-progress"
            ref={progressRef}
            onClick={handleProgressClick}
          >
            <div
              className="player-progress-fill"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="player-time">{formatTime(duration)}</span>
        </div>
      </div>

      <div className="player-volume">
        {currentTrack && (
          <button
            className={`player-btn player-btn-mode${hasLrc && lyricsVisible ? " active" : ""}`}
            onClick={onLyricsToggle}
            title={hasLrc ? "Toggle lyrics" : "Link LRC file"}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
              <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zM6 20V4h7v5h5v11H6zm2-6h8v2H8v-2zm0-3h8v2H8v-2z" />
            </svg>
          </button>
        )}
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
          className="volume-slider"
        />
      </div>
    </div>
  );
}
