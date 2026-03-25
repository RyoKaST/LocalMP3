import { useRef, useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

export const EQ_BANDS = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const;

export const SIMPLE_BANDS = [
  { label: "Bass", indices: [0, 1] },
  { label: "Low-Mid", indices: [2, 3] },
  { label: "Mid", indices: [4, 5] },
  { label: "High-Mid", indices: [6, 7] },
  { label: "Treble", indices: [8, 9] },
];

export interface EqPreset {
  name: string;
  gains: number[];
}

export const EQ_PRESETS: EqPreset[] = [
  { name: "Flat", gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { name: "Bass Boost", gains: [6, 5, 4, 2, 0, 0, 0, 0, 0, 0] },
  { name: "Treble Boost", gains: [0, 0, 0, 0, 0, 0, 2, 4, 5, 6] },
  { name: "Rock", gains: [5, 4, 2, 0, -1, -1, 2, 3, 4, 5] },
  { name: "Pop", gains: [-1, 1, 3, 4, 3, 0, -1, -1, 1, 2] },
  { name: "Jazz", gains: [3, 2, 1, 2, -1, -1, 0, 1, 2, 3] },
  { name: "Classical", gains: [4, 3, 2, 1, -1, -1, 0, 2, 3, 4] },
  { name: "Vocal", gains: [-2, -1, 0, 2, 4, 4, 3, 1, 0, -1] },
  { name: "Electronic", gains: [5, 4, 2, 0, -2, 0, 1, 3, 4, 5] },
  { name: "Hip-Hop", gains: [6, 5, 3, 1, 0, -1, 1, 0, 2, 3] },
];

interface PerTrackEq {
  gains: number[];
  preamp: number;
  preset: string;
}

export function useEqualizer(audioRef: React.RefObject<HTMLAudioElement | null>) {
  const ctxRef = useRef<AudioContext | null>(null);
  const filtersRef = useRef<BiquadFilterNode[]>([]);
  const preampRef = useRef<GainNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const connectedRef = useRef(false);

  const [gains, setGains] = useState<number[]>(() => {
    const saved = localStorage.getItem("eq_gains");
    return saved ? JSON.parse(saved) : new Array(10).fill(0);
  });
  const [preamp, setPreamp] = useState(() => {
    return parseFloat(localStorage.getItem("eq_preamp") || "0");
  });
  const [preset, setPreset] = useState(() => {
    return localStorage.getItem("eq_preset") || "Flat";
  });
  const [enabled, setEnabled] = useState(() => {
    return localStorage.getItem("eq_enabled") !== "false";
  });
  const [perTrack, setPerTrack] = useState(() => {
    return localStorage.getItem("eq_per_track") === "true";
  });
  const [currentTrackPath, setCurrentTrackPath] = useState<string | null>(null);
  const [chainReady, setChainReady] = useState(false);

  const ensureChain = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || connectedRef.current) return;

    try {
      const ctx = new AudioContext();
      const source = ctx.createMediaElementSource(audio);
      const filters = EQ_BANDS.map((freq) => {
        const f = ctx.createBiquadFilter();
        f.type = "peaking";
        f.frequency.value = freq;
        f.Q.value = 1.4;
        f.gain.value = 0;
        return f;
      });
      const preampNode = ctx.createGain();
      preampNode.gain.value = 1;

      source.connect(filters[0]);
      for (let i = 0; i < filters.length - 1; i++) {
        filters[i].connect(filters[i + 1]);
      }
      filters[filters.length - 1].connect(preampNode);
      preampNode.connect(ctx.destination);

      ctxRef.current = ctx;
      filtersRef.current = filters;
      preampRef.current = preampNode;
      sourceRef.current = source;
      connectedRef.current = true;
      setChainReady(true);

      if (ctx.state === "suspended") {
        ctx.resume();
      }
    } catch (e) {
      console.error("EQ: failed to create audio chain", e);
    }
  }, [audioRef]);

  useEffect(() => {
    const check = setInterval(() => {
      const audio = audioRef.current;
      if (!audio) return;
      clearInterval(check);

      ensureChain();

      const onPlay = () => {
        if (!connectedRef.current) ensureChain();
        if (ctxRef.current?.state === "suspended") {
          ctxRef.current.resume();
        }
      };
      audio.addEventListener("play", onPlay);
    }, 50);
    return () => clearInterval(check);
  }, [audioRef, ensureChain]);

  useEffect(() => {
    if (!chainReady) return;
    filtersRef.current.forEach((f, i) => {
      f.gain.value = enabled ? gains[i] : 0;
    });
    if (preampRef.current) {
      preampRef.current.gain.value = enabled ? Math.pow(10, preamp / 20) : 1;
    }
  }, [gains, preamp, enabled, chainReady]);

  useEffect(() => {
    if (!perTrack) {
      localStorage.setItem("eq_gains", JSON.stringify(gains));
      localStorage.setItem("eq_preamp", String(preamp));
      localStorage.setItem("eq_preset", preset);
    }
    localStorage.setItem("eq_enabled", String(enabled));
    localStorage.setItem("eq_per_track", String(perTrack));
  }, [gains, preamp, preset, enabled, perTrack]);

  const setBandGain = useCallback((index: number, value: number) => {
    setGains((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
    setPreset("Custom");
  }, []);

  const applyPreset = useCallback((name: string) => {
    const p = EQ_PRESETS.find((pr) => pr.name === name);
    if (p) {
      setGains([...p.gains]);
      setPreset(name);
    }
  }, []);

  const setPreampValue = useCallback((value: number) => {
    setPreamp(value);
  }, []);

  const loadTrackEq = useCallback((trackPath: string | null) => {
    setCurrentTrackPath(trackPath);
    if (!perTrack || !trackPath) {
      const saved = localStorage.getItem("eq_gains");
      setGains(saved ? JSON.parse(saved) : new Array(10).fill(0));
      setPreamp(parseFloat(localStorage.getItem("eq_preamp") || "0"));
      setPreset(localStorage.getItem("eq_preset") || "Flat");
      return;
    }
    invoke<string | null>("get_track_eq", { trackPath }).then((data) => {
      if (data) {
        const parsed: PerTrackEq = JSON.parse(data);
        setGains(parsed.gains);
        setPreamp(parsed.preamp);
        setPreset(parsed.preset);
      } else {
        const saved = localStorage.getItem("eq_gains");
        setGains(saved ? JSON.parse(saved) : new Array(10).fill(0));
        setPreamp(parseFloat(localStorage.getItem("eq_preamp") || "0"));
        setPreset(localStorage.getItem("eq_preset") || "Flat");
      }
    }).catch(() => {});
  }, [perTrack]);

  useEffect(() => {
    if (!perTrack || !currentTrackPath) return;
    const data: PerTrackEq = { gains, preamp, preset };
    invoke("set_track_eq", { trackPath: currentTrackPath, eq: JSON.stringify(data) }).catch(() => {});
  }, [gains, preamp, preset, perTrack, currentTrackPath]);

  return {
    gains,
    preamp,
    preset,
    enabled,
    perTrack,
    setBandGain,
    applyPreset,
    setPreampValue,
    setEnabled,
    setPerTrack,
    loadTrackEq,
  };
}
