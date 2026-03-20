import { Track } from "../types";

export interface EngineCallbacks {
  onTimeUpdate: (currentTime: number, duration: number) => void;
  onTrackSwitch: (newTrack: Track) => void;
  onTransitionStart: () => void;
  onTransitionEnd: () => void;
  onEnded: () => void;
}
