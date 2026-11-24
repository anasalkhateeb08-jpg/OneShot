/**
 * Procedural sounds made in code (no audio files, nothing taken from other games).
 * Each sound is rendered once into an AudioBuffer when the audio context starts.
 */

export interface SoundBank {
  shot: AudioBuffer;
  bolt: AudioBuffer;
  reload: AudioBuffer;
  dryFire: AudioBuffer;
  impactGround: AudioBuffer;
  impactRock: AudioBuffer;
  impactWood: AudioBuffer;
  impactBody: AudioBuffer;
  heartbeat: AudioBuffer;
  windNoise: AudioBuffer;
}

type Synth = (t: number, rand: () => number) => number;

function render(ctx: AudioContext, seconds: number, synth: Synth, seed: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.max(1, Math.floor(seconds * rate));
  const buffer = ctx.createBuffer(1, length, rate);
  const data = buffer.getChannelData(0);
  let s = seed >>> 0;
  const rand = (): number => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  let peak = 0;
  for (let i = 0; i < length; i++) {
    const v = synth(i / rate, rand);
    data[i] = v;
    peak = Math.max(peak, Math.abs(v));
  }
  if (peak > 0) for (let i = 0; i < length; i++) data[i] = (data[i] ?? 0) / peak;
  return buffer;
}

/** Simple one-pole low-pass state for noise shaping. */
function lowpass(alpha: number): (x: number) => number {
  let y = 0;
  return (x) => {
    y += alpha * (x - y);
    return y;
  };
}

function click(t: number, at: number, rand: () => number, sharp = 600): number {
  const d = t - at;
  if (d < 0 || d > 0.03) return 0;
  return (rand() * 2 - 1) * Math.exp(-d * sharp);
}

export function createSoundBank(ctx: AudioContext): SoundBank {
  const shotLp = lowpass(0.25);
  const groundLp = lowpass(0.08);
  const rockLp = lowpass(0.5);
  const bodyLp = lowpass(0.04);
  const woodLp = lowpass(0.3);
  const windLp = lowpass(0.02);

  return {
    // Sharp crack plus a deep boom with a short tail.
    shot: render(
      ctx,
      1.4,
      (t, r) => {
        const crack = (r() * 2 - 1) * Math.exp(-t * 90);
        const boom = Math.sin(2 * Math.PI * (55 + 40 * Math.exp(-t * 20)) * t) * Math.exp(-t * 6);
        const tail = shotLp(r() * 2 - 1) * Math.exp(-t * 3.5) * 0.6;
        return crack * 0.9 + boom * 0.8 + tail;
      },
      11,
    ),
    // Bolt lifted back, then pushed forward and locked.
    bolt: render(
      ctx,
      0.9,
      (t, r) =>
        click(t, 0.0, r) + click(t, 0.18, r) * 0.7 + click(t, 0.62, r) + click(t, 0.7, r, 900),
      12,
    ),
    reload: render(
      ctx,
      1.2,
      (t, r) =>
        click(t, 0.0, r) * 0.6 + click(t, 0.45, r) + click(t, 0.9, r) * 0.8 + click(t, 1.05, r),
      13,
    ),
    dryFire: render(ctx, 0.1, (t, r) => click(t, 0.0, r, 1200), 14),
    impactGround: render(ctx, 0.5, (t, r) => groundLp(r() * 2 - 1) * Math.exp(-t * 12), 15),
    impactRock: render(
      ctx,
      0.4,
      (t, r) =>
        rockLp(r() * 2 - 1) * Math.exp(-t * 30) +
        Math.sin(2 * Math.PI * 1900 * t) * Math.exp(-t * 40) * 0.3,
      16,
    ),
    // Wood a bullet punches through: a dull thump, a hollow knock, and splintering crackle.
    impactWood: render(
      ctx,
      0.5,
      (t, r) => {
        const thump =
          Math.sin(2 * Math.PI * (150 - 70 * Math.min(1, t * 8)) * t) * Math.exp(-t * 22);
        const knock =
          (Math.sin(2 * Math.PI * 420 * t) + 0.6 * Math.sin(2 * Math.PI * 760 * t)) *
          Math.exp(-t * 35) *
          0.28;
        const crackle =
          woodLp(r() * 2 - 1) *
          (click(t, 0.012, r, 220) + click(t, 0.035, r, 260) * 0.7 + click(t, 0.07, r, 300) * 0.5);
        // A bright, sharp snap at the very start: only close impacts keep it after the distance
        // low-pass, so near and far wood sound clearly different.
        const snap = (r() * 2 - 1) * Math.exp(-t * 500) * 1.1;
        return thump * 0.9 + knock + crackle * 2.2 + snap;
      },
      25,
    ),
    impactBody: render(
      ctx,
      0.35,
      (t, r) =>
        bodyLp(r() * 2 - 1) * Math.exp(-t * 18) +
        Math.sin(2 * Math.PI * 90 * t) * Math.exp(-t * 25),
      17,
    ),
    // Two low thumps: lub-dub.
    heartbeat: render(
      ctx,
      0.5,
      (t) => {
        const beat = (at: number, amp: number): number => {
          const d = t - at;
          return d < 0 ? 0 : Math.sin(2 * Math.PI * 48 * d) * Math.exp(-d * 28) * amp;
        };
        return beat(0, 1) + beat(0.22, 0.7);
      },
      18,
    ),
    windNoise: render(ctx, 4, (_t, r) => windLp(r() * 2 - 1), 19),
  };
}
