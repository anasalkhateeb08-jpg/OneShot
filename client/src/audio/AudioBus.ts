import { AUDIO } from "@oneshot/shared";

export interface PlayOptions {
  /** Seconds before the sound starts (for example, distance / speed of sound). */
  delayS?: number;
  gain?: number;
  /** Stereo position, -1 (left) to 1 (right). */
  pan?: number;
}

/**
 * Small Web Audio mixer. The audio context starts on the first user click (browser rule).
 * Sounds far away are delayed by distance / speed of sound (master phase 1: the shot is heard
 * late at 343 m/s) and get quieter with distance.
 */
export class AudioBus {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private windSource: AudioBufferSourceNode | null = null;
  private windGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  volume = 0.8;

  /** Call from a user gesture (click). Safe to call many times. */
  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  get context(): AudioContext | null {
    return this.ctx;
  }

  play(buffer: AudioBuffer | null, options: PlayOptions = {}): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || !buffer) return;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = options.gain ?? 1;
    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, options.pan ?? 0));
    source.connect(gain).connect(panner).connect(master);
    source.start(ctx.currentTime + Math.max(0, options.delayS ?? 0));
  }

  /** Plays a sound that happens `distanceM` away: delayed by the speed of sound and attenuated. */
  playAtDistance(buffer: AudioBuffer | null, distanceM: number, gain = 1, pan = 0): void {
    const attenuation = 1 / (1 + distanceM / 60);
    this.play(buffer, { delayS: distanceM / AUDIO.speedOfSoundMps, gain: gain * attenuation, pan });
  }

  /** Starts the looping wind bed (call once after unlock). */
  startWind(noise: AudioBuffer | null): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || !noise || this.windSource) return;
    const source = ctx.createBufferSource();
    source.buffer = noise;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 400;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    source.connect(filter).connect(gain).connect(master);
    source.start();
    this.windSource = source;
    this.windFilter = filter;
    this.windGain = gain;
  }

  /** Wind loudness and brightness follow the wind speed (0..1). */
  setWind(strength01: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.windGain || !this.windFilter) return;
    const s = Math.max(0, Math.min(1, strength01));
    this.windGain.gain.setTargetAtTime(0.05 + 0.25 * s, ctx.currentTime, 0.5);
    this.windFilter.frequency.setTargetAtTime(250 + 900 * s, ctx.currentTime, 0.5);
  }
}
