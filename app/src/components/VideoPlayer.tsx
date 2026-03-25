import { useState, useRef, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useLyricsSync } from "../hooks/useLyricsSync";

interface VideoPlayerProps {
  videoPath: string;
  onClose: () => void;
  audioRef?: React.RefObject<HTMLAudioElement | null>;
  isAudioPlaying?: boolean;
  onAudioPlayPause?: () => void;
  onVideoEnd?: () => void;
  onNext?: () => void;
  onPrev?: () => void;
  lrcPath?: string | null;
  trackPath?: string;
}

function formatTime(secs: number): string {
  if (isNaN(secs)) return "0:00";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function VideoPlayer({
  videoPath,
  onClose,
  audioRef,
  isAudioPlaying,
  onAudioPlayPause,
  onVideoEnd,
  onNext,
  onPrev,
  lrcPath,
  trackPath,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const bgVideoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [seekValue, setSeekValue] = useState(0);
  const [volume, setVolume] = useState(1);
  const isSeeking = useRef(false);

  const hasLinkedAudio = !!audioRef;
  const [audioSource, setAudioSource] = useState<"track" | "video">(
    hasLinkedAudio ? "track" : "video"
  );

  const videoLyricsRef = useRef<HTMLDivElement>(null);
  const [showLyrics, setShowLyrics] = useState(true);
  const { lines: lyricsLines, currentLine: lyricsCurrentLine, seekToLine: lyricsSeekToLine } = useLyricsSync({
    lrcPath: lrcPath ?? null,
    trackPath: trackPath ?? "",
    audioRef: audioRef ?? { current: null },
    enabled: !!lrcPath && !!audioRef,
  });
  const hasLyrics = lyricsLines.length > 0;

  useEffect(() => {
    if (lyricsCurrentLine < 0 || !videoLyricsRef.current) return;
    const container = videoLyricsRef.current;
    const inner = container.querySelector(".video-lyrics-inner") as HTMLElement | null;
    const activeLine = container.querySelector(".video-lyrics-line.active") as HTMLElement | null;
    if (!inner || !activeLine) return;
    const containerHeight = container.clientHeight;
    const lineTop = activeLine.offsetTop;
    const lineHeight = activeLine.offsetHeight;
    const offset = lineTop - containerHeight / 2 + lineHeight / 2;
    inner.style.transform = `translateY(${-offset}px)`;
  }, [lyricsCurrentLine]);

  const [audioOffset, setAudioOffset] = useState(0);
  const [showSyncPanel, setShowSyncPanel] = useState(false);
  const offsetLoaded = useRef(false);

  useEffect(() => {
    invoke<number>("get_video_offset", { videoPath })
      .then((saved) => {
        setAudioOffset(saved);
        offsetLoaded.current = true;
      })
      .catch(() => { offsetLoaded.current = true; });
  }, [videoPath]);

  useEffect(() => {
    if (!offsetLoaded.current) return;
    invoke("set_video_offset", { videoPath, offset: audioOffset }).catch(console.error);
  }, [audioOffset, videoPath]);

  useEffect(() => {
    let cleanup = () => {};
    import("@tauri-apps/api/window").then(({ getCurrentWindow }) => {
      const win = getCurrentWindow();
      win.setAlwaysOnTop(true).catch(() => {});
      cleanup = () => win.setAlwaysOnTop(false).catch(() => {});
    });
    return () => cleanup();
  }, []);

  const [isEntering, setIsEntering] = useState(true);
  const [isClosing, setIsClosing] = useState(false);

  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setIsEntering(false));
    return () => cancelAnimationFrame(raf);
  }, []);

  const [loadError, setLoadError] = useState<string | null>(null);
  const [converting, setConverting] = useState(false);
  const [resolvedPath, setResolvedPath] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    setConverting(false);
    setResolvedPath(null);

    invoke<string | null>("get_converted_video", { videoPath }).then((converted) => {
      if (cancelled) return;
      setResolvedPath(converted ?? videoPath);
    }).catch(() => {
      if (!cancelled) setResolvedPath(videoPath);
    });

    return () => { cancelled = true; };
  }, [videoPath]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !resolvedPath) return;
    const src = convertFileSrc(resolvedPath);
    video.src = src;
    video.muted = audioSource === "track";
    if (bgVideoRef.current) {
      bgVideoRef.current.src = src;
      bgVideoRef.current.muted = true;
    }

    if (audioRef?.current && audioSource === "track") {
      const audio = audioRef.current;
      video.currentTime = Math.max(0, audio.currentTime + audioOffset);

      if (!audio.paused) {
        video.play().then(() => setIsPlaying(true)).catch(console.error);
      } else {
        setIsPlaying(false);
        video.preload = "auto";
      }
    } else {
      video.play().then(() => setIsPlaying(true)).catch(console.error);
    }
  }, [resolvedPath]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = audioSource === "track";
  }, [audioSource]);

  useEffect(() => {
    if (!audioRef?.current || audioSource !== "track") return;

    const interval = setInterval(() => {
      const video = videoRef.current;
      const audio = audioRef.current;
      if (!video || !audio || isSeeking.current) return;

      if (audio.paused && !video.paused) {
        video.pause();
        return;
      }
      if (!audio.paused && video.paused) {
        video.currentTime = audio.currentTime + audioOffset;
        video.play().catch(console.error);
        return;
      }

      if (audio.paused || video.paused) return;

      const expectedVideoTime = audio.currentTime + audioOffset;
      const drift = Math.abs(expectedVideoTime - video.currentTime);

      if (drift > 0.5) {
        video.currentTime = expectedVideoTime;
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [audioRef, audioSource, audioOffset]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onTimeUpdate = () => {
      if (!isSeeking.current) {
        setCurrentTime(video.currentTime);
        setSeekValue(video.currentTime);
      }
    };
    const onDurationChange = () => setDuration(video.duration);
    const onEnded = () => {
      setIsPlaying(false);
      if (onVideoEnd) onVideoEnd();
    };
    const onError = () => {
      const err = video.error;
      const ext = videoPath.split(".").pop()?.toLowerCase() ?? "";
      if (err && (err.code === 3 || err.code === 4) && ext !== "mp4" && ext !== "mov" && !converting) {
        setConverting(true);
        setLoadError(`Converting ${ext.toUpperCase()} to MP4...`);
        invoke<string>("convert_video", { videoPath })
          .then((converted) => {
            setLoadError(null);
            setConverting(false);
            setResolvedPath(converted);
          })
          .catch((e) => {
            setConverting(false);
            setLoadError(`Conversion failed: ${e}`);
          });
      } else if (err && !converting) {
        const msgs: Record<number, string> = {
          1: "Loading aborted",
          2: "Network error",
        };
        setLoadError(msgs[err.code] ?? `Playback error (code ${err.code})`);
      }
    };

    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("durationchange", onDurationChange);
    video.addEventListener("ended", onEnded);
    video.addEventListener("error", onError);

    return () => {
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("durationchange", onDurationChange);
      video.removeEventListener("ended", onEnded);
      video.removeEventListener("error", onError);
    };
  }, [videoPath]);

  useEffect(() => {
    const video = videoRef.current;
    const bg = bgVideoRef.current;
    if (!video || !bg) return;
    const onPlay = () => { bg.currentTime = video.currentTime; bg.play().catch(() => {}); };
    const onPause = () => bg.pause();
    const onSeeked = () => { bg.currentTime = video.currentTime; };
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("seeked", onSeeked);
    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("seeked", onSeeked);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
      if (e.code === "Space" && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        togglePlayPause();
      }
      showControls();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const showControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setControlsVisible(false), 3000);
  }, []);

  useEffect(() => {
    showControls();
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [showControls]);

  function togglePlayPause() {
    const video = videoRef.current;
    const audio = audioRef?.current;
    if (!video) return;

    if (hasLinkedAudio && audio && audioSource === "track") {
      if (audio.paused) {
        audio.play().catch(console.error);
        setIsPlaying(true);
      } else {
        audio.pause();
        setIsPlaying(false);
      }
    } else {
      if (video.paused) {
        video.play().then(() => setIsPlaying(true)).catch(console.error);
      } else {
        video.pause();
        setIsPlaying(false);
      }
    }
  }

  function toggleAudioSource() {
    const next = audioSource === "track" ? "video" : "track";
    const video = videoRef.current;
    const audio = audioRef?.current;

    if (video) {
      video.muted = next === "track";
      video.playbackRate = 1.0;
    }

    if (audio) {
      if (next === "video") {
        audio.muted = true;
        audio.playbackRate = 1.0;
      } else {
        const expectedAudioTime = (video?.currentTime ?? 0) - audioOffset;
        if (expectedAudioTime >= 0) {
          audio.currentTime = expectedAudioTime;
          audio.muted = false;
          if (audio.paused && isPlaying) {
            audio.play().catch(console.error);
          }
        } else {
          audio.muted = false;
        }
      }
    }

    setAudioSource(next);
  }

  const handleSeekStart = useCallback(() => {
    isSeeking.current = true;
  }, []);

  const handleSeekChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = parseFloat(e.target.value);
      setSeekValue(val);
      setCurrentTime(val);
    },
    []
  );

  const handleSeekEnd = useCallback(() => {
    if (audioRef?.current && audioSource === "track") {
      const expectedAudioTime = seekValue - audioOffset;
      if (expectedAudioTime < 0) {
        audioRef.current.currentTime = 0;
        if (isAudioPlaying) onAudioPlayPause?.();
      } else if (audioRef.current.duration && expectedAudioTime >= audioRef.current.duration) {
        audioRef.current.pause();
      } else {
        audioRef.current.currentTime = expectedAudioTime;
      }
      if (videoRef.current) videoRef.current.currentTime = seekValue;
    } else {
      if (videoRef.current) videoRef.current.currentTime = seekValue;
    }
    isSeeking.current = false;
  }, [seekValue, audioRef, audioSource, audioOffset, isAudioPlaying, onAudioPlayPause]);

  const handleVolumeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = parseFloat(e.target.value);
      setVolume(v);
      if (audioSource === "track" && audioRef?.current) {
        audioRef.current.volume = v;
      }
      if (videoRef.current) {
        videoRef.current.volume = v;
      }
    },
    [audioSource, audioRef]
  );

  const handleClose = useCallback(() => {
    if (isClosing) return;
    setIsClosing(true);
  }, [isClosing]);

  const handleTransitionEnd = useCallback(() => {
    if (isClosing) {
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.src = "";
      }
      if (bgVideoRef.current) {
        bgVideoRef.current.pause();
        bgVideoRef.current.src = "";
      }
      if (audioRef?.current) {
        audioRef.current.muted = false;
      }
      onClose();
    }
  }, [isClosing, onClose, audioRef]);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const overlayClass = [
    "fs-overlay video-player-overlay",
    isEntering ? "fs-entering" : "",
    isClosing ? "fs-closing" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={overlayClass}
      onMouseMove={showControls}
      onTransitionEnd={handleTransitionEnd}
    >
      <video
        ref={bgVideoRef}
        className="video-player-bg-video"
        muted
        playsInline
      />
      <video
        ref={videoRef}
        className="video-player-video"
        onClick={togglePlayPause}
      />
      {hasLyrics && showLyrics && (
        <div className="video-lyrics" ref={videoLyricsRef}>
          <div className="video-lyrics-inner">
            {lyricsLines.map((line, i) => (
              <div
                key={i}
                className={`video-lyrics-line${i === lyricsCurrentLine ? " active" : ""}`}
                onClick={() => lyricsSeekToLine(i)}
              >
                {line.text || "\u00A0"}
              </div>
            ))}
          </div>
        </div>
      )}
      {loadError && (
        <div className="video-player-error">
          {loadError}
        </div>
      )}
      <button
        className={`video-player-close${controlsVisible ? "" : " hidden"}`}
        onClick={handleClose}
      >
        <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
          <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
        </svg>
      </button>
      {showSyncPanel && hasLinkedAudio && controlsVisible && (
        <div className="video-sync-panel" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
          <span className="video-sync-label">Audio offset</span>
          <div className="video-sync-controls">
            <button
              className="video-sync-btn"
              onClick={() => setAudioOffset((o) => Math.round((o - 1) * 10) / 10)}
              title="-1s"
            >
              -1s
            </button>
            <button
              className="video-sync-btn"
              onClick={() => setAudioOffset((o) => Math.round((o - 0.1) * 10) / 10)}
              title="-0.1s"
            >
              -0.1
            </button>
            <span className="video-sync-value">
              {audioOffset >= 0 ? "+" : ""}{audioOffset.toFixed(1)}s
            </span>
            <button
              className="video-sync-btn"
              onClick={() => setAudioOffset((o) => Math.round((o + 0.1) * 10) / 10)}
              title="+0.1s"
            >
              +0.1
            </button>
            <button
              className="video-sync-btn"
              onClick={() => setAudioOffset((o) => Math.round((o + 1) * 10) / 10)}
              title="+1s"
            >
              +1s
            </button>
            {audioOffset !== 0 && (
              <button
                className="video-sync-btn video-sync-reset"
                onClick={() => setAudioOffset(0)}
              >
                Reset
              </button>
            )}
          </div>
        </div>
      )}
      <div
        className={`vp-controls${controlsVisible ? "" : " hidden"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="vp-progress">
          <div className="video-progress-wrapper">
            <input
              type="range"
              min="0"
              max={duration || 0}
              step="0.1"
              value={seekValue}
              onMouseDown={handleSeekStart}
              onChange={handleSeekChange}
              onMouseUp={handleSeekEnd}
              className="vp-progress-slider"
              style={{ "--progress": `${progress}%` } as React.CSSProperties}
            />
            {hasLinkedAudio && audioOffset > 0 && duration > 0 && (
              <div
                className="video-sync-marker"
                style={{ left: `${(audioOffset / duration) * 100}%` }}
                title={`Song starts at ${audioOffset.toFixed(1)}s`}
              />
            )}
          </div>
        </div>
        <div className="vp-bar">
          <div className="vp-left">
            <span className="vp-time">{formatTime(currentTime)}</span>
            <span className="vp-time-sep">/</span>
            <span className="vp-time">{formatTime(duration)}</span>
          </div>
          <div className="vp-center">
            {onPrev && (
              <button className="vp-btn" onClick={onPrev}>
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                  <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
                </svg>
              </button>
            )}
            <button className="vp-btn vp-btn-play" onClick={togglePlayPause}>
              {isPlaying ? (
                <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>
            {onNext && (
              <button className="vp-btn" onClick={onNext}>
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                  <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
                </svg>
              </button>
            )}
          </div>
          <div className="vp-right">
            {hasLyrics && (
              <button
                className={`vp-btn vp-btn-toggle${showLyrics ? " active" : ""}`}
                onClick={() => setShowLyrics((s) => !s)}
                title={showLyrics ? "Hide lyrics" : "Show lyrics"}
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                  <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55C7.79 13 6 14.79 6 17s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                </svg>
              </button>
            )}
            {hasLinkedAudio && (
              <button
                className={`vp-btn vp-btn-toggle${audioSource === "video" ? " active" : ""}`}
                onClick={toggleAudioSource}
                title={audioSource === "track" ? "Using audio file — click for video audio" : "Using video audio — click for audio file"}
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                  <path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z" />
                </svg>
              </button>
            )}
            {hasLinkedAudio && (
              <button
                className={`vp-btn vp-btn-toggle${showSyncPanel ? " active" : ""}`}
                onClick={() => setShowSyncPanel((s) => !s)}
                title="Audio sync offset"
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                  <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z" />
                </svg>
              </button>
            )}
            <div className="vp-vol">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
              </svg>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={volume}
                onChange={handleVolumeChange}
                className="vp-vol-slider"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
