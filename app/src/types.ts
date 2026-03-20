export interface Track {
  title: string;
  artist: string;
  album: string;
  duration: number;
  path: string;
  cover: string | null;
  lrc_path: string | null;
  track_number: number | null;
}

export interface LrcLine {
  time: number;
  text: string;
}

export type TransitionStyle = "fade" | "rise" | "cut" | "echo_out" | "custom";

export interface CurvePoint {
  x: number;  // 0–1, time progression
  y: number;  // 0–1, volume level
  handleIn: { x: number; y: number };   // relative offset toward previous point
  handleOut: { x: number; y: number };  // relative offset toward next point
}

export interface CustomCurves {
  outgoing: CurvePoint[];
  incoming: CurvePoint[];
}

export interface TransitionPreset {
  style: TransitionStyle;
  duration: number;
  custom_curves?: CustomCurves | null;
}

export interface PlaylistMix {
  enabled: boolean;
  default_transition: TransitionPreset;
  pair_overrides: Record<string, TransitionPreset>;
}

export interface Playlist {
  id: string;
  name: string;
  cover: string | null;
  tracks: Track[];
  mix?: PlaylistMix | null;
}
