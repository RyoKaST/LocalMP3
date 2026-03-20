import { convertFileSrc } from "@tauri-apps/api/core";
import { Track, TransitionPreset, CustomCurves } from "../types";
import { buildLookupTable } from "./curveUtils";
import { EngineCallbacks } from "./types";
import { createImpulseResponse } from "./impulse";

interface Channel {
  element: HTMLAudioElement;
  source: MediaElementAudioSourceNode;
  gain: GainNode;
  dryGain: GainNode;
  wetGain: GainNode;
}

export class TransitionEngine {
  private ctx: AudioContext;
  private masterGain: GainNode;
  private convolver: ConvolverNode;
  private channelA: Channel;
  private channelB: Channel;
  private active: "A" | "B" = "A";
  private transitioning = false;
  private transitionTimer: number | null = null;
  private callbacks: EngineCallbacks;
  private currentTrack: Track | null = null;
  private monitorInterval: number | null = null;
  // @ts-ignore: savedPosition will be used for restoring state after preview in a future task
  private savedPosition: { track: Track; time: number; wasPlaying: boolean } | null = null;
  private previewing = false;

  constructor(callbacks: EngineCallbacks) {
    this.callbacks = callbacks;
    this.ctx = new AudioContext();
    this.masterGain = this.ctx.createGain();
    this.masterGain.connect(this.ctx.destination);

    // Convolver for reverb (Echo Out preset)
    this.convolver = this.ctx.createConvolver();
    this.convolver.buffer = createImpulseResponse(this.ctx);
    this.convolver.connect(this.masterGain);

    this.channelA = this.createChannel();
    this.channelB = this.createChannel();
  }

  private createChannel(): Channel {
    const element = new Audio();
    element.crossOrigin = "anonymous";
    const source = this.ctx.createMediaElementSource(element);
    const gain = this.ctx.createGain();
    const dryGain = this.ctx.createGain();
    const wetGain = this.ctx.createGain();

    source.connect(gain);
    gain.connect(dryGain);
    gain.connect(wetGain);
    dryGain.connect(this.masterGain);
    wetGain.connect(this.convolver);

    dryGain.gain.value = 1;
    wetGain.gain.value = 0;

    return { element, source, gain, dryGain, wetGain };
  }

  private getActive(): Channel {
    return this.active === "A" ? this.channelA : this.channelB;
  }

  private getNext(): Channel {
    return this.active === "A" ? this.channelB : this.channelA;
  }

  async play(track: Track): Promise<void> {
    if (this.ctx.state === "suspended") {
      await this.ctx.resume();
    }

    this.cancelTransition();
    const ch = this.getActive();
    ch.element.src = convertFileSrc(track.path);
    ch.gain.gain.value = 1;
    ch.dryGain.gain.value = 1;
    ch.wetGain.gain.value = 0;
    this.currentTrack = track;

    await ch.element.play();
    this.startMonitor();
  }

  pause(): void {
    if (this.transitioning) {
      this.channelA.element.pause();
      this.channelB.element.pause();
    } else {
      this.getActive().element.pause();
    }
  }

  resume(): void {
    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }
    if (this.transitioning) {
      this.channelA.element.play();
      this.channelB.element.play();
    } else {
      this.getActive().element.play();
    }
  }

  seek(time: number): void {
    this.cancelTransition();
    this.getActive().element.currentTime = time;
  }

  setVolume(v: number): void {
    this.masterGain.gain.value = v;
  }

  getCurrentTime(): number {
    return this.getActive().element.currentTime;
  }

  getDuration(): number {
    return this.getActive().element.duration || 0;
  }

  private startMonitor(): void {
    this.stopMonitor();

    // Use an interval so we can dynamically pick the dominant channel during transitions
    this.monitorInterval = window.setInterval(() => {
      let ch: Channel;
      if (this.transitioning) {
        const gainA = this.channelA.gain.gain.value;
        const gainB = this.channelB.gain.gain.value;
        ch = gainB > gainA ? this.channelB : this.channelA;
      } else {
        ch = this.getActive();
      }
      this.callbacks.onTimeUpdate(ch.element.currentTime, ch.element.duration || 0);
    }, 250);

    // ended event for non-mix playback fallback
    const ch = this.getActive();
    const onEnded = () => {
      this.callbacks.onEnded();
    };
    ch.element.addEventListener("ended", onEnded);
    (ch as any)._onEnded = onEnded;
  }

  private stopMonitor(): void {
    if (this.monitorInterval !== null) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
    for (const ch of [this.channelA, this.channelB]) {
      if ((ch as any)._onEnded) {
        ch.element.removeEventListener("ended", (ch as any)._onEnded);
        delete (ch as any)._onEnded;
      }
    }
  }

  cancelTransition(): void {
    if (this.transitionTimer !== null) {
      clearTimeout(this.transitionTimer);
      this.transitionTimer = null;
    }
    if (this.transitioning) {
      const next = this.getNext();
      next.element.pause();
      next.gain.gain.cancelScheduledValues(this.ctx.currentTime);
      next.gain.gain.value = 0;
      next.dryGain.gain.value = 1;
      next.wetGain.gain.value = 0;

      const active = this.getActive();
      active.gain.gain.cancelScheduledValues(this.ctx.currentTime);
      active.gain.gain.value = 1;
      active.dryGain.gain.value = 1;
      active.wetGain.gain.value = 0;

      this.transitioning = false;
    }
  }

  async scheduleTransition(nextTrack: Track, preset: TransitionPreset): Promise<void> {
    if (this.ctx.state === "suspended") {
      await this.ctx.resume();
    }

    const activeCh = this.getActive();
    const nextCh = this.getNext();
    const now = this.ctx.currentTime;
    const dur = preset.style === "cut" ? 0.05 : preset.duration;

    nextCh.element.src = convertFileSrc(nextTrack.path);
    nextCh.gain.gain.value = 0;
    nextCh.dryGain.gain.value = 1;
    nextCh.wetGain.gain.value = 0;

    this.transitioning = true;
    this.callbacks.onTransitionStart();

    await nextCh.element.play();

    if (preset.style === "custom" && preset.custom_curves) {
      this.applyCustomCurve(activeCh, nextCh, preset.custom_curves, now, dur);
    } else {
      this.applyPresetRamps(activeCh, nextCh, preset, now, dur);
    }

    this.transitionTimer = window.setTimeout(() => {
      activeCh.element.pause();
      activeCh.gain.gain.cancelScheduledValues(this.ctx.currentTime);
      activeCh.gain.gain.value = 0;
      activeCh.dryGain.gain.value = 1;
      activeCh.wetGain.gain.value = 0;

      nextCh.gain.gain.cancelScheduledValues(this.ctx.currentTime);
      nextCh.gain.gain.value = 1;
      nextCh.dryGain.gain.value = 1;
      nextCh.wetGain.gain.value = 0;

      this.active = this.active === "A" ? "B" : "A";
      this.currentTrack = nextTrack;
      this.transitioning = false;
      this.transitionTimer = null;

      this.stopMonitor();
      this.startMonitor();

      this.callbacks.onTrackSwitch(nextTrack);
      this.callbacks.onTransitionEnd();
    }, dur * 1000);
  }

  private applyPresetRamps(
    outCh: Channel,
    inCh: Channel,
    preset: TransitionPreset,
    now: number,
    dur: number,
  ): void {
    switch (preset.style) {
      case "fade":
        outCh.gain.gain.setValueAtTime(1, now);
        outCh.gain.gain.linearRampToValueAtTime(0, now + dur);
        inCh.gain.gain.setValueAtTime(0, now);
        inCh.gain.gain.linearRampToValueAtTime(1, now + dur);
        break;

      case "rise":
        outCh.gain.gain.setValueAtTime(1, now);
        outCh.gain.gain.exponentialRampToValueAtTime(0.001, now + dur * 0.3);
        inCh.gain.gain.setValueAtTime(0.001, now);
        inCh.gain.gain.exponentialRampToValueAtTime(1, now + dur);
        break;

      case "cut":
        outCh.gain.gain.setValueAtTime(0, now + 0.01);
        inCh.gain.gain.setValueAtTime(1, now + 0.01);
        break;

      case "echo_out":
        outCh.dryGain.gain.setValueAtTime(1, now);
        outCh.dryGain.gain.linearRampToValueAtTime(0, now + dur);
        outCh.wetGain.gain.setValueAtTime(0, now);
        outCh.wetGain.gain.linearRampToValueAtTime(0.7, now + dur * 0.4);
        outCh.wetGain.gain.linearRampToValueAtTime(0, now + dur);
        outCh.gain.gain.setValueAtTime(1, now);
        inCh.gain.gain.setValueAtTime(0, now);
        inCh.gain.gain.linearRampToValueAtTime(1, now + dur);
        break;

      default:
        // "custom" handled by applyCustomCurve before reaching here
        break;
    }
  }

  private applyCustomCurve(
    outCh: Channel,
    inCh: Channel,
    curves: CustomCurves,
    now: number,
    dur: number,
  ): void {
    const outTable = buildLookupTable(curves.outgoing);
    const inTable = buildLookupTable(curves.incoming);
    const steps = outTable.length;
    const stepDur = dur / (steps - 1);

    outCh.gain.gain.setValueAtTime(Math.max(0.001, outTable[0]), now);
    inCh.gain.gain.setValueAtTime(Math.max(0.001, inTable[0]), now);

    for (let i = 1; i < steps; i++) {
      const t = now + i * stepDur;
      outCh.gain.gain.linearRampToValueAtTime(Math.max(0.001, outTable[i]), t);
      inCh.gain.gain.linearRampToValueAtTime(Math.max(0.001, inTable[i]), t);
    }
  }

  shouldStartTransition(transitionDuration: number): boolean {
    if (this.transitioning) return false;
    const ch = this.getActive();
    const remaining = (ch.element.duration || 0) - ch.element.currentTime;
    return remaining > 0 && remaining <= transitionDuration;
  }

  isTransitioning(): boolean {
    return this.transitioning;
  }

  getCurrentTrack(): Track | null {
    return this.currentTrack;
  }

  async preview(trackA: Track, trackB: Track, preset: TransitionPreset): Promise<void> {
    const activeCh = this.getActive();
    const wasPlaying = !activeCh.element.paused;
    if (this.currentTrack) {
      this.savedPosition = {
        track: this.currentTrack,
        time: activeCh.element.currentTime,
        wasPlaying,
      };
    }

    this.cancelTransition();
    activeCh.element.pause();

    this.previewing = true;
    const dur = preset.style === "cut" ? 0.5 : preset.duration;

    const chA = this.channelA;
    const chB = this.channelB;
    chA.element.src = convertFileSrc(trackA.path);
    chB.element.src = convertFileSrc(trackB.path);

    await new Promise<void>((resolve) => {
      let loaded = 0;
      const check = () => { if (++loaded >= 2) resolve(); };
      chA.element.addEventListener("loadedmetadata", check, { once: true });
      chB.element.addEventListener("loadedmetadata", check, { once: true });
    });

    const aStart = Math.max(0, (chA.element.duration || 0) - dur);
    chA.element.currentTime = aStart;
    chB.element.currentTime = 0;

    chA.gain.gain.value = 1;
    chA.dryGain.gain.value = 1;
    chA.wetGain.gain.value = 0;
    chB.gain.gain.value = 0;
    chB.dryGain.gain.value = 1;
    chB.wetGain.gain.value = 0;

    this.active = "A";
    const now = this.ctx.currentTime;

    await Promise.all([chA.element.play(), chB.element.play()]);
    if (preset.style === "custom" && preset.custom_curves) {
      this.applyCustomCurve(chA, chB, preset.custom_curves, now, dur);
    } else {
      this.applyPresetRamps(chA, chB, preset, now, dur);
    }

    return new Promise<void>((resolve) => {
      this.transitionTimer = window.setTimeout(() => {
        chA.element.pause();
        chB.element.pause();
        chA.gain.gain.cancelScheduledValues(this.ctx.currentTime);
        chB.gain.gain.cancelScheduledValues(this.ctx.currentTime);
        chA.gain.gain.value = 0;
        chB.gain.gain.value = 0;
        chA.dryGain.gain.value = 1;
        chA.wetGain.gain.value = 0;
        chB.dryGain.gain.value = 1;
        chB.wetGain.gain.value = 0;
        this.previewing = false;
        this.transitionTimer = null;
        resolve();
      }, dur * 1000 + 500);
    });
  }

  isPreviewing(): boolean {
    return this.previewing;
  }

  destroy(): void {
    this.cancelTransition();
    this.stopMonitor();
    this.channelA.element.pause();
    this.channelB.element.pause();
    this.ctx.close();
  }
}
