import { useState, useRef, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";

interface VideoPlayerProps {
  videoPath: string;
  onClose: () => void;
  audioRef?: React.RefObject<HTMLAudioElement | null>;
  isAudioPlaying?: boolean;
  onAudioPlayPause?: () => void;
  onVideoEnd?: () => void;
  onNext?: () => void;
  onPrev?: () => void;
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
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
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
    video.src = convertFileSrc(resolvedPath);
    video.muted = audioSource === "track";

    if (audioRef?.current) {
      const audio = audioRef.current;
      const audioTime = audio.currentTime;
      video.currentTime = Math.max(0, audioTime + audioOffset);

      const audioEnded = audio.duration && audioTime >= audio.duration - 0.1;

      if (isAudioPlaying && !audioEnded) {
        video.play().then(() => setIsPlaying(true)).catch(console.error);
      } else if (audioEnded) {
        video.play().then(() => setIsPlaying(true)).catch(console.error);
        if (!audio.paused) audio.pause();
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
      if (!video || !audio || isSeeking.current || video.paused) return;
      const expectedAudioTime = video.currentTime - audioOffset;

      if (expectedAudioTime < 0) {
        if (!audio.paused) audio.pause();
        audio.currentTime = 0;
      } else if (audio.duration && expectedAudioTime >= audio.duration) {
        if (!audio.paused) audio.pause();
      } else {
        if (audio.paused) {
          audio.currentTime = expectedAudioTime;
          audio.play().catch(console.error);
        }
        const drift = Math.abs(expectedAudioTime - audio.currentTime);
        if (drift > 0.3) {
          audio.currentTime = expectedAudioTime;
        }
      }
    }, 200);
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

  const isMac = /Mac/.test(navigator.userAgent);
  const hiddenAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isMac) return;
    const onVisibilityChange = () => {
      if (document.hidden) {
        hiddenAtRef.current = Date.now();
      } else if (hiddenAtRef.current && isPlaying) {
        const elapsed = (Date.now() - hiddenAtRef.current) / 1000;
        hiddenAtRef.current = null;
        const video = videoRef.current;
        const audio = audioRef?.current;
        if (video) {
          video.currentTime += elapsed;
          video.play().catch(console.error);
        }
        if (audio && audioSource === "track") {
          audio.currentTime += elapsed;
          audio.play().catch(console.error);
        }
      } else {
        hiddenAtRef.current = null;
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [isMac, audioRef, audioSource, isPlaying]);

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
    if (video.paused) {
      video.play().then(() => setIsPlaying(true)).catch(console.error);
      if (audio) {
        const expectedAudioTime = video.currentTime - audioOffset;
        if (expectedAudioTime >= 0 && (!audio.duration || expectedAudioTime < audio.duration)) {
          audio.currentTime = expectedAudioTime;
          audio.play().catch(console.error);
        }
      }
    } else {
      video.pause();
      setIsPlaying(false);
      if (audio && !audio.paused) {
        audio.pause();
      }
    }
  }

  function toggleAudioSource() {
    const next = audioSource === "track" ? "video" : "track";
    const video = videoRef.current;
    const audio = audioRef?.current;

    if (video) {
      video.muted = next === "track";
    }

    if (audio) {
      if (next === "video") {
        audio.muted = true;
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
    if (videoRef.current) videoRef.current.currentTime = seekValue;
    if (audioRef?.current) {
      const expectedAudioTime = seekValue - audioOffset;
      if (expectedAudioTime < 0) {
        audioRef.current.currentTime = 0;
        if (isAudioPlaying) onAudioPlayPause?.();
      } else if (audioRef.current.duration && expectedAudioTime >= audioRef.current.duration) {
        audioRef.current.pause();
      } else {
        audioRef.current.currentTime = expectedAudioTime;
      }
    }
    isSeeking.current = false;
  }, [seekValue, audioRef, audioOffset, isAudioPlaying, onAudioPlayPause]);

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
      <div className="video-player-bg" />
      <video
        ref={videoRef}
        className="video-player-video"
        onClick={togglePlayPause}
      />
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
        className={`fs-controls video-player-controls${controlsVisible ? "" : " hidden"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="fs-progress">
          <span className="fs-time">{formatTime(currentTime)}</span>
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
              className="fs-progress-slider"
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
          <span className="fs-time">{formatTime(duration)}</span>
        </div>
        <div className="fs-buttons">
          {onPrev && (
            <button className="fs-btn" onClick={onPrev}>
              <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
              </svg>
            </button>
          )}
          <button className="fs-btn fs-btn-play" onClick={togglePlayPause}>
            {isPlaying ? (
              <svg
                viewBox="0 0 24 24"
                width="36"
                height="36"
                fill="currentColor"
              >
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
              </svg>
            ) : (
              <svg
                viewBox="0 0 24 24"
                width="36"
                height="36"
                fill="currentColor"
              >
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>
          {onNext && (
            <button className="fs-btn" onClick={onNext}>
              <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
              </svg>
            </button>
          )}
          {hasLinkedAudio && audioOffset !== 0 && (
            <div className="video-offset-indicator">
              {audioOffset > 0
                ? `Song starts at ${audioOffset.toFixed(1)}s in video`
                : `Song starts ${Math.abs(audioOffset).toFixed(1)}s before video`}
            </div>
          )}
        </div>
        <div className="fs-volume">
          {hasLinkedAudio && (
            <button
              className={`fs-btn fs-btn-mode video-audio-toggle${audioSource === "video" ? " active" : ""}`}
              onClick={toggleAudioSource}
              title={
                audioSource === "track"
                  ? "Using audio file (high quality) — click for video audio"
                  : "Using video audio — click for audio file (high quality)"
              }
            >
              <svg
                viewBox="0 0 24 24"
                width="18"
                height="18"
                fill="currentColor"
              >
                <path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z" />
              </svg>
            </button>
          )}
          {hasLinkedAudio && (
            <button
              className={`fs-btn fs-btn-mode${showSyncPanel ? " active" : ""}`}
              onClick={() => setShowSyncPanel((s) => !s)}
              title="Audio sync offset"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z" />
              </svg>
            </button>
          )}
          <svg
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="currentColor"
          >
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
      </div>
    </div>
  );
}
