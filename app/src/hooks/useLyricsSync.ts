import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { LrcLine } from "../types";

interface UseLyricsSyncOptions {
  lrcPath: string | null;
  trackPath: string;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  enabled?: boolean;
}

export function useLyricsSync({ lrcPath, trackPath, audioRef, enabled = true }: UseLyricsSyncOptions) {
  const [lines, setLines] = useState<LrcLine[]>([]);
  const [currentLine, setCurrentLine] = useState(-1);
  const [speed, setSpeedState] = useState(1);
  const speedRef = useRef(1);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load LRC file
  useEffect(() => {
    if (!lrcPath) {
      setLines([]);
      return;
    }
    invoke<LrcLine[]>("read_lrc", { lrcPath })
      .then(setLines)
      .catch(() => setLines([]));
  }, [lrcPath]);

  // Load saved speed when track changes
  useEffect(() => {
    invoke<number>("get_lrc_speed", { trackPath }).then((s) => {
      setSpeedState(s);
      speedRef.current = s;
    });
  }, [trackPath]);

  // RAF-based tick loop for syncing lyrics with audio currentTime
  useEffect(() => {
    const audio = audioRef.current;
    if (!enabled || !audio || lines.length === 0) return;

    let rafId: number;
    let lastIdx = -1;
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
  }, [audioRef, lines, enabled]);

  // Cleanup debounce timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  const setSpeed = useCallback(
    (v: number) => {
      setSpeedState(v);
      speedRef.current = v;
      // Debounce save to avoid spamming during drag
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        invoke("set_lrc_speed", { trackPath, speed: v });
      }, 300);
    },
    [trackPath]
  );

  const resetSpeed = useCallback(() => {
    setSpeedState(1);
    speedRef.current = 1;
    invoke("set_lrc_speed", { trackPath, speed: 1.0 });
  }, [trackPath]);

  const seekToLine = useCallback(
    (lineIndex: number) => {
      const audio = audioRef.current;
      if (audio && lines[lineIndex]) {
        audio.currentTime = lines[lineIndex].time / speedRef.current;
      }
    },
    [audioRef, lines]
  );

  return { lines, currentLine, speed, setSpeed, resetSpeed, seekToLine };
}
