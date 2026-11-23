/**
 * Deterministic scope sway (master section 8).
 * The SERVER adds this offset to the raw look direction when a shot is fired, so a cheater
 * cannot remove sway. The client computes the same function to show the sway in the scope.
 */
import { PLAYER, SWAY } from "./constants";
import { createRng } from "./geometry";
import type { BreathState } from "./breath";
import type { Posture } from "./messages";

export interface AngleOffset {
  yaw: number;
  pitch: number;
}

export interface SwayAmplitudes {
  /** Amplitude of the wandering motion, radians. */
  amplitudeRad: number;
  /** Amplitude of the slow breathing rhythm (vertical), radians. */
  breathingRad: number;
}

/** Amplitudes from posture, breath, and wound state. */
export function swayAmplitudes(
  posture: Posture,
  breath: BreathState,
  limbWounded: boolean,
  creeping = false,
): SwayAmplitudes {
  const postureMul = PLAYER.swayMultiplier[posture];
  const woundMul =
    (limbWounded ? PLAYER.limbWoundSwayFactor : 1) * (creeping ? PLAYER.creepSwayFactor : 1);
  return {
    amplitudeRad: SWAY.baseAmplitudeRad * postureMul * breath.swayScale * woundMul,
    breathingRad: SWAY.breathAmplitudeRad * postureMul * breath.breathingWeight * woundMul,
  };
}

interface SwayShape {
  f: [number, number, number, number];
  ph: [number, number, number, number, number];
}

const TWO_PI = Math.PI * 2;

function shapeFor(seed: number): SwayShape {
  const r = createRng(seed ^ 0x53574159);
  const freq = () => SWAY.minFreqHz + (SWAY.maxFreqHz - SWAY.minFreqHz) * r();
  return {
    f: [freq(), freq(), freq(), freq()],
    ph: [r() * TWO_PI, r() * TWO_PI, r() * TWO_PI, r() * TWO_PI, r() * TWO_PI],
  };
}

/**
 * Angular sway offset at a time.
 * |yaw| <= amplitudeRad and |pitch| <= amplitudeRad + breathingRad.
 */
export function swayOffset(timeS: number, seed: number, amps: SwayAmplitudes): AngleOffset {
  const { f, ph } = shapeFor(seed);
  const a = amps.amplitudeRad;
  const yaw =
    a *
    (0.6 * Math.sin(TWO_PI * f[0] * timeS + ph[0]) + 0.4 * Math.sin(TWO_PI * f[1] * timeS + ph[1]));
  const pitch =
    a *
      (0.6 * Math.sin(TWO_PI * f[2] * timeS + ph[2]) +
        0.4 * Math.sin(TWO_PI * f[3] * timeS + ph[3])) +
    amps.breathingRad * Math.sin((TWO_PI * timeS) / SWAY.breathCycleS + ph[4]);
  return { yaw, pitch };
}
